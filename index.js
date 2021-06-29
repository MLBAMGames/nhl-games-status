const express = require("express");
const axios = require("axios");

const app = express();
const port = 3000;

function getToday() {
  const today = new Date();
  return [today.getFullYear(), today.getMonth() + 1, today.getDate()].join("-");
}

function success(_, res) {
  res.sendFile(__dirname + "/svg/circle_green.svg");
}

function error(_, res) {
  res.sendFile(__dirname + "/svg/circle_red.svg");
}

const checkUs = async (server) => {
  try {
    await axios.get(`http://${server}`);
  } catch {
    return false;
  }
  return true;
};

function getServers() {
  return Array.from({ length: 5 })
    .map((_, i) => process.env[`SERVER${i + 1}`])
    .filter(Boolean);
}

app.get("/", (_, res) => {
  res.sendStatus(200);
});

app.get("/status/us", async (req, res) => {
  const [server] = getServers();
  if (!server) return error(req, res);

  try {
    const response = await axios.get(
      `http://${server}/getM3U8.php?league=NHL&id=${process.env.TEST_GAME_ID}&cdn=akc&date=${process.env.TEST_GAME_DATE}`
    );
    console.log(response.data);
    if (typeof response.data !== "string" || !response.data.includes(".m3u8")) {
      throw new Error();
    }
  } catch {
    error(req, res);
  }
  success(req, res);
});

app.get("/ping/us", async (req, res) => {
  const servers = getServers();
  const results = await Promise.all(servers.map(checkUs));
  return results.includes(true) ? success(req, res) : error(req, res);
});

app.get("/ping/mlbam", async (req, res) => {
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

app.get("/status/mlbam", async (req, res) => {
  try {
    const response = await axios.get(
      "http://statsapi.web.nhl.com/api/v1/schedule",
      { params: { startDate: getToday(), endDate: getToday() } }
    );
    console.log(response.data);
    if (response.data.totalGames === 0) {
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
