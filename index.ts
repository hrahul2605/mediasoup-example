import express from "express";
import { createServer } from "http";
import { Server } from "socket.io";
import { createWorker, types } from "mediasoup";

import config from "./config";

let worker: types.Worker;
let producer: types.Producer;
let consumer: types.Consumer;
let producerTransport: types.WebRtcTransport;
let consumerTransport: types.WebRtcTransport;
let router: types.Router;

const app = express();
app.use(express.json());
app.use(express.static(__dirname));
const PORT = process.env.PORT || 5000;

const httpServer = createServer(app);
httpServer.listen(PORT, () => {
  console.log(`Server Started at PORT:${PORT}`);
});

const io = new Server(httpServer, {
  serveClient: false,
});

io.on("connection", (socket) => {
  console.log("Connection established");

  socket.on("getRouterRTPCapibilities", async (_, cb) => {
    cb(router.rtpCapabilities);
  });

  socket.on("createProducerTransport", async (_, cb) => {
    try {
      const { transport, data } = await createWebRtcTransport();

      producerTransport = transport;
      cb(data);
    } catch (err) {
      console.log("ERR:", err);
      cb({ err: err.message });
    }
  });

  socket.on("createConsumerTransport", async (_, cb) => {
    try {
      const { transport, data } = await createWebRtcTransport();

      consumerTransport = transport;
      cb(data);
    } catch (err) {
      console.log("ERR:", err);
      cb({ err: err.message });
    }
  });

  socket.on("connectProducerTransport", async (args, cb) => {
    await producerTransport.connect({ dtlsParameters: args.dtlsParameters });
    cb();
  });

  socket.on("connectConsumerTransport", async (args, cb) => {
    await consumerTransport.connect({ dtlsParameters: args.dtlsParameters });
    cb();
  });

  socket.on("produce", async (args, cb) => {
    const { kind, rtpParameters } = args;
    producer = await producerTransport.produce({ kind, rtpParameters });
    cb({ id: producer.id });

    socket.broadcast.emit("newProducer");
  });

  socket.on("consume", async (args, cb) => {
    try {
      consumer = await consumerTransport.consume({
        producerId: producer.id,
        rtpCapabilities: args.rtpCapabilities,
        paused: false,
      });

      cb({
        producerId: producer.id,
        consumerId: consumer.id,
        kind: consumer.kind,
        rtpParameters: consumer.rtpParameters,
        type: consumer.type,
        producerPaused: consumer.producerPaused,
      });
    } catch (err) {
      console.log("ERR:", err);
      cb({ err });
    }
  });

  socket.on("resumeConsumer", async (_, cb) => {
    await consumer.resume();
    cb();
  });
});

const createWebRtcTransport = async () => {
  const transport = await router.createWebRtcTransport({
    ...config.mediasoup.webRtcTransportOptions,
  });

  transport.setMaxIncomingBitrate(
    config.mediasoup.webRtcTransportOptions.maxIncomingBitrate
  );
  return {
    transport,
    data: {
      id: transport.id,
      iceParameters: transport.iceParameters,
      iceCandidates: transport.iceCandidates,
      dtlsParameters: transport.dtlsParameters,
    },
  };
};

(async () => {
  try {
    worker = await createWorker({
      logLevel: config.mediasoup.workerSettings.logLevel,
      logTags: config.mediasoup.workerSettings.logTags,
      rtcMinPort: config.mediasoup.workerSettings.rtcMinPort,
      rtcMaxPort: config.mediasoup.workerSettings.rtcMaxPort,
    });

    console.log("Worker Created");

    worker.on("died", () => {
      console.error("Worker Died");
      process.exit(1);
    });

    const mediaCodecs = config.mediasoup.routerOptions.mediaCodecs;
    router = await worker.createRouter({ mediaCodecs });
    console.log("Router Created");
  } catch (e) {
    console.log(e);
  }
})();
