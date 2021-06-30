const express = require("express");
const axios = require("axios");
const get = require("lodash.get");

const app = express();
const port = 3000;

function getUtcDateToLocale(utcDate) {
  var d = new Date(utcDate);
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
}

function getUtcToLocale(utcDate) {
  var d = new Date(utcDate);
  return d.toLocaleString("en-CA", { timeZone: "America/Los_Angeles" });
}

function getToday() {
  const today = new Date();
  return getUtcDateToLocale(today);
}

function getYesterday() {
  const today = new Date();
  today.setDate(today.getDate() - 1);
  return getUtcDateToLocale(today);
}

function success(_, res) {
  res.sendFile(__dirname + "/svg/circle_green.svg");
}

function warning(_, res) {
  res.sendFile(__dirname + "/svg/circle_yellow.svg");
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

  const now = new Date();
  const games = get(response.data, "dates[0].games", []);
  const [firstGame] = games;
  const gamesFirstStreamIds = games.reduce((acc, game) => {
    var date = new Date(game.gameDate);
    if (now < date) return acc;
    const medias = get(game, "content.media.epg", []).find(
      (m) => m.title === "NHLTV"
    );
    acc.push(get(medias, "items[0].mediaPlaybackId"));
    return acc;
  }, []);

  return {
    totalGames: games.length,
    streamIds: gamesFirstStreamIds,
    gameDate: firstGame.gameDate,
  };
}

const isStream = (stream) =>
  typeof stream === "string" && stream.includes(".m3u8");

app.get("/", (_, res) => {
  res.sendStatus(200);
});

app.get("/us/game", async (req, res) => {
  const [server] = getServers();
  if (!server) return error(req, res);

  try {
    const { totalGames, streamIds, gameDate } = await getGameInfoFromMLBAM(
      req.query.date || (req.query.yesterday && getYesterday()) || getToday()
    );
    if (totalGames === 0) throw new Error();
    const date = getUtcDateToLocale(gameDate);
    const responses = await Promise.all(
      streamIds.map(
        async (streamId) =>
          await axios.get(
            `http://${server}/getM3U8.php?league=NHL&id=${streamId}&cdn=akc&date=${date}`
          )
      )
    );
    const streams = responses.map((r) => r.data);
    console.log(streams);
    if (streams.every(isStream)) {
      success(req, res);
    } else if (streams.some(isStream)) {
      warning(req, res);
    }
    throw new Error();
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
