const express = require("express");
const axios = require("axios");
const get = require("lodash.get");

const app = express();
const port = 3000;

function getUtcDateToLocale(utcDate) {
  var d = new Date(utcDate || Date.now());
  return d.toLocaleDateString("en-CA", { timeZone: "America/Los_Angeles" });
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
    if (!get(game, "gameDate")) return acc;
    var date = new Date(game.gameDate);
    if (now < date) return acc;
    const medias = get(game, "content.media.epg", []).find(
      (m) => get(m, "title") === "NHLTV"
    );
    acc.push(get(medias, "items[0].mediaPlaybackId"));
    return acc;
  }, []);

  return {
    totalGames: games.length,
    streamIds: gamesFirstStreamIds,
    gameDate: get(firstGame, "gameDate"),
  };
}

async function getStream(server, streamId, date) {
  return await axios.get(
    `http://${server}/getM3U8.php?league=NHL&id=${streamId}&cdn=akc&date=${date}`
  );
}

async function getWorkingServer() {
  const servers = getServers();
  const results = await Promise.all(servers.map(checkUs));
  return {
    server: servers[results.findIndex(Boolean)],
    isUp: results.includes(true),
  };
}

const isStream = (stream) =>
  typeof stream === "string" && stream.includes(".m3u8");

const hasQueryParam = (query, param) =>
  query !== null && typeof query === "object" && query.hasOwnProperty(param);

app.get("/", (_, res) => {
  res.sendStatus(200);
});

app.get("/us/game", async (req, res) => {
  const { server } = await getWorkingServer();
  if (!server) throw new Error();

  try {
    const { streamIds, gameDate } = await getGameInfoFromMLBAM(
      req.query.date ||
        (hasQueryParam(req.query, "yesterday") && getYesterday()) ||
        getToday()
    );
    const date = getUtcDateToLocale(gameDate);
    const responses = await Promise.all(
      streamIds.map((streamId) => getStream(server, streamId, date))
    );
    const streams = responses.map((r) => r.data);
    console.log(streams);
    if (streams.every(isStream)) {
      return success(req, res);
    } else if (streams.some(isStream)) {
      return warning(req, res);
    }
    throw new Error();
  } catch {
    return error(req, res);
  }
});

app.get("/us/badge", async (req, res) => {
  const { isUp } = await getWorkingServer();
  const { data: badge } = await axios.get("https://img.shields.io/static/v1", {
    params: {
      label: "server",
      style: "flat-square",
      message: isUp ? "up" : "down",
      color: isUp ? "success" : "critical",
    },
  });
  res.type("image/svg+xml");
  res.send(badge);
});

app.get("/us/ping", async (req, res) => {
  const { isUp } = await getWorkingServer();
  return isUp ? success(req, res) : error(req, res);
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
    return error(req, res);
  }
  return success(req, res);
});

app.get("/mlbam/schedule", async (req, res) => {
  try {
    const { totalGames } = await getGameInfoFromMLBAM(
      req.query.date ||
        (hasQueryParam(req.query, "yesterday") && getYesterday()) ||
        getToday()
    );
    if (totalGames === 0) {
      throw new Error();
    }
  } catch {
    return error(req, res);
  }
  return success(req, res);
});

app.listen(process.env.PORT || port, () => {
  console.log(`Listening at http://localhost:${port}`);
});
