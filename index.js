const { createServer } = require("http");
const mediasoup = require("mediasoup");
const express = require("express");
const socket = require("socket.io");

const config = require("./config").default;

const PORT = process.env.PORT || 3000;

const expressApp = express();
expressApp.use(express.json());

const httpServer = createServer(expressApp);

const io = socket(httpServer);

io.on("connection", () => {
  console.log("Connection");
});

const run = async () => {
  const worker = await mediasoup.createWorker({
    logLevel: config.mediasoup.workerSettings.logLevel,
    logTags: config.mediasoup.workerSettings.logTags,
    rtcMinPort: Number(config.mediasoup.workerSettings.rtcMinPort),
    rtcMaxPort: Number(config.mediasoup.workerSettings.rtcMaxPort),
  });

  const router = await worker.createRouter({mediaCodecs: config.mediasoup.routerOptions.mediaCodecs});

  console.log(router.rtpCapabilities);
};

httpServer.listen(PORT, () => {
  console.log(`Server started at PORT: ${PORT}`);
});

run();
