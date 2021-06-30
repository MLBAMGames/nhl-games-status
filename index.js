const express = require("express");
const axios = require("axios");
const get = require("lodash.get");

const app = express();
const port = 3000;

function getUtcDateToLocale(utcDate) {
  var d = new Date(utcDate);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function getToday() {
  const today = new Date();
  return getUtcDateToLocale(today);
}

function success(_, res) {
  res.sendFile(__dirname + "/svg/circle_green.svg");
}

function error(_, res) {
  res.sendFile(__dirname + "/svg/circle_red.svg");
}

function getServers() {
  return Array.from({ length: 5 })
    .map((_, i) => process.env[`SERVER${i + 1}`])
    .filter(Boolean);
}

async function checkUs(server) {
  try {
    await axios.get(`http://${server}`);
  } catch {
    return false;
  }
  return true;
}

async function getGameInfoFromMLBAM(date) {
  const response = await axios.get(
    "http://statsapi.web.nhl.com/api/v1/schedule",
    {
      params: {
        startDate: date,
        endDate: date,
        expand: "schedule.game.content.media.epg",
      },
    }
  );

  const games = get(response.data, "dates[0].games", []);
  const firstGame = get(games, "[0]");
  const gameMedias = get(firstGame, "content.media.epg", []);
  const gameTvMedias = gameMedias.find((m) => m.title === "NHLTV");
  const gameFirstStreamId = get(gameTvMedias, "items[0].mediaPlaybackId");

  return {
    totalGames: games.length,
    streamId: gameFirstStreamId,
    gameDate: firstGame.gameDate,
  };
}

app.get("/", (_, res) => {
  res.sendStatus(200);
});

app.get("/us/game", async (req, res) => {
  const [server] = getServers();
  if (!server) return error(req, res);

  try {
    const { streamId, gameDate } = await getGameInfoFromMLBAM(
      req.query.date || getToday()
    );
    const date = getUtcDateToLocale(gameDate);
    const response = await axios.get(
      `http://${server}/getM3U8.php?league=NHL&id=${streamId}&cdn=akc&date=${date}`
    );
    if (typeof response.data !== "string" || !response.data.includes(".m3u8")) {
      throw new Error();
    }
  } catch {
    error(req, res);
  }
  success(req, res);
});

app.get("/us/ping", async (req, res) => {
  const servers = getServers();
  const results = await Promise.all(servers.map(checkUs));
  return results.includes(true) ? success(req, res) : error(req, res);
});

app.get("/mlbam/ping", async (req, res) => {
  try {
    const response = await axios.get(
      "http://statsapi.web.nhl.com/api/v1/schedule"
    );
    if (!response.data.copyright) {
      throw new Error();
    }
  } catch {
    error(req, res);
  }
  success(req, res);
});

app.get("/mlbam/schedule", async (req, res) => {
  try {
    const { totalGames } = await getGameInfoFromMLBAM(
      req.query.date || getToday()
    );
    if (totalGames === 0) {
      throw new Error();
    }
  } catch {
    error(req, res);
  }
  success(req, res);
});

app.listen(process.env.PORT || port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
