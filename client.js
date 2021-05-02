const mediasoup = require("mediasoup-client");
const io = require("socket.io-client");

const connectBtn = document.querySelector("#connectBtn");
const joinBtn = document.querySelector("#joinBtn");
const shareWebcamBtn = document.querySelector("#shareWebcam");

connectBtn.addEventListener("click", () => {
  connect();
});

joinBtn.addEventListener("click", () => {
  join();
});

shareWebcamBtn.addEventListener("click", () => {
  shareWebcam();
});

let mediasoupDevice;
let socket;
let producer;

const getMedia = async () => {
  return await navigator.mediaDevices.getUserMedia({
    audio: true,
    video: true,
  });
};

async function connect() {
  socket = io();
  socket.request = function request(type, data = {}) {
    return new Promise((resolve) => {
      socket.emit(type, data, resolve);
    });
  };
  socket.on("connect", async () => {
    console.log("Connected");
    const routerRtpCapabilities = await socket.request(
      "getRouterRTPCapibilities"
    );

    mediasoupDevice = new mediasoup.Device();
    await mediasoupDevice.load({ routerRtpCapabilities });
  });
}

const shareWebcam = async () => {
  const data = await socket.request("createProducerTransport", {
    rtpCapabilities: mediasoupDevice.rtpCapabilities,
  });

  const transport = mediasoupDevice.createSendTransport(data);
  transport.on("connect", async ({ dtlsParameters }, cb, errb) => {
    socket
      .request("connectProducerTransport", { dtlsParameters })
      .then(cb)
      .catch(errb);
  });

  transport.on("produce", async ({ kind, rtpParameters }, cb, eb) => {
    try {
      const { id } = await socket.request("produce", {
        transportId: transport.id,
        kind,
        rtpParameters,
      });
      cb({ id });
    } catch (err) {
      eb(err);
    }
  });

  let stream;

  transport.on("connectionstatechange", (state) => {
    if (state === "connected")
      document.querySelector("#localVideo").srcObject = stream;
  });

  try {
    stream = await getMedia();
    const track = stream.getVideoTracks()[0];
    const params = { track };
    producer = await transport.produce(params);
  } catch (err) {}
};

const join = async () => {
  const data = await socket.request("createConsumerTransport");

  const transport = mediasoupDevice.createRecvTransport(data);
  transport.on("connect", ({ dtlsParameters }, cb, eb) => {
    socket
      .request("connectConsumerTransport", {
        transportId: transport.id,
        dtlsParameters,
      })
      .then(cb)
      .catch(eb);
  });
  let remoteStream = new MediaStream();

  transport.on("connectionstatechange", async (state) => {
    if (state === "connected") {
      document.querySelector("#remoteVideo").srcObject = remoteStream;
    }
  });

  const { rtpCapabilities } = mediasoupDevice;
  const consumeData = await socket.request("consume", { rtpCapabilities });
  const { producerId, consumerId, kind, rtpParameters } = consumeData;
  const consumer = await transport.consume({
    id: consumerId,
    producerId: producerId,
    kind,
    rtpParameters,
  });
  console.log(consumer.track);
  remoteStream.addTrack(consumer.track);
  await socket.request("resume");
};
