import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";

class VideoChat {
  private peer: null | RTCPeerConnection;
  private ws: Socket | null;
  private localMedia: null | MediaStream;
  private rtcConfig: RTCConfiguration;
  private dataChannel: RTCDataChannel | null;
  private dataChannelConnected: Boolean;
  constructor() {
    this.ws = null;
    this.peer = null;
    this.localMedia = null;
    this.dataChannel = null;
    this.dataChannelConnected = false;
    this.rtcConfig = {
      iceServers: [
        { urls: "stun:stun.l.google.com:19302" },
      ],
    };
  }

  async init(ws: Socket, getLocalMedia?: () => Promise<MediaStream>) {
    this.ws = ws;
    this.ws.on("iceCandidate", ({ iceCandidate }: any) => {
      console.log("远端添加iceCandidate");
      this.peer && this.peer.addIceCandidate(new RTCIceCandidate(iceCandidate));
    });
    // 呼叫被接受
    this.ws.on("answer", ({ answer }: any) => {
      console.log("answer");
      this.peer && this.peer.setRemoteDescription(answer);
    });
    this.localMedia = await (getLocalMedia
        ? getLocalMedia()
        : this.getLocalMedia());
  }

  // 创建RTC
  createLocalPeer() {
    this.peer = new RTCPeerConnection(this.rtcConfig);
    return this;
  }

  // 将媒体流加入通信
  addTrack() {
    if (!this.peer || !this.localMedia) return;
    // this.localMedia.getTracks().forEach(track => this.peer.addTrack(track, this.localMedia));
    this.peer?.addStream(this.localMedia);
    return this;
  }

  // 创建 SDP offer
  async createOffer() {
    if (!this.peer) return;
    const offer = await this.peer.createOffer({
      offerToReceiveAudio: true,
      offerToReceiveVideo: true,
    });
    await this.peer.setLocalDescription(offer);
    return offer;
  }
  async createAnswer(offer: any) {
    if (!this.peer) return;
    await this.peer.setRemoteDescription(offer);
    const answer = await this.peer.createAnswer({
      offerToReceiveAudio: true,
      OfferToReceiveVideo: true,
    });
    await this.peer.setLocalDescription(answer);
    return answer;
  }

  listenerAddStream(cb: any) {
    this.peer?.addEventListener("addstream", (event: any) => {
      console.log("addstream事件触发", event.stream);
      cb && cb(event.stream);
    });
    return this;
  }
  // 获取本地媒体流
  async getLocalMedia(mediaStream: MediaStream | null = null) {
    return await navigator.mediaDevices
        .getUserMedia({
          video: { facingMode: "user" },
          audio: true,
        })
        .catch((e) => {
          console.log("getLocalMedia", e);
          return null;
        });
  }

  // 监听候选加入
  listenerCandidateAdd(cb: any) {
    this.peer?.addEventListener("icecandidate", (event) => {
      const iceCandidate = event.candidate;
      if (iceCandidate) {
        console.log("发送candidate给远端");
        cb && cb(iceCandidate);
      }
    });
    return this;
  }
  // 检测ice协商过程
  listenerGatheringstatechange() {
    this.peer?.addEventListener("icegatheringstatechange", (event) => {
      // console.log("ice协商中: ", event.target);
    });
    return this;
  }
  createDataChannel(onMessage: (event: MessageEvent) => void, label = "data") {
    console.log("createDataChannel");
    if (this.peer) {
      this.dataChannel = this.peer.createDataChannel(label);
      this.dataChannel.onopen = () => {
        console.log("datachannel open");
        this.dataChannelConnected = true;
      };
      this.dataChannel.onclose = () => {
        console.log("datachannel close");
        this.dataChannel = null;
        this.dataChannelConnected = false;
      };
      this.dataChannel.onmessage = onMessage;
    }
    return this;
  }
  receiveDataChannel(onMessage: (event: MessageEvent) => void) {
    console.log("receiveDataChannel");
    if (this.peer) {
      this.peer.ondatachannel = (e) => {
        this.dataChannel = e.channel;
        this.dataChannel.onopen = () => {
          console.log("datachannel open");
          this.dataChannelConnected = true;
        };
        this.dataChannel.onclose = () => {
          console.log("datachannel close");
          this.dataChannel = null;
          this.dataChannelConnected = false;
        };
        this.dataChannel.onmessage = onMessage;
      };
    }
    return this;
  }
  sendData(data: any) {
    if (this.dataChannelConnected) {
      this.dataChannel!.send(data);
    } else {
      console.log("dataChannel not connected");
    }
  }
}

export const useWS = (spaceName = "/", headers = {}) => {
  const [ws, setWs] = useState<Socket>();
  useEffect(() => {
    console.log("ws connect", import.meta.env.VITE_APP_WEBSOCKET_URL);
    const ws = io(import.meta.env.VITE_APP_WEBSOCKET_URL + spaceName, {
      forceNew: true,
      path: import.meta.env.VITE_APP_WEBSOCKET_PATH,
      extraHeaders: {
        ...headers,
      },
    });
    setWs(ws);
    return () => {
      console.log("ws close");
      ws.close();
    };
  }, [spaceName]);
  return ws;
};

export const WebRtcUser: React.FC<{
  adminInfo?: {
    id: string;
    name: string;
  };
}> = ({ adminInfo = { id: "admin", name: "admin" } }) => {
  const ws = useWS("/webrtc", { ...adminInfo, isRobot: false });
  const [robotList, setRobotList] = useState<[{ id: string; name: string }]>();
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  const chat = new VideoChat();
  useEffect(() => {
    if (ws) {
      ws.on("called", async (callingInfo) => {
        chat.createLocalPeer();

        chat.receiveDataChannel((event) => {
          console.log("receive message :", event.data);
        });

        chat.listenerGatheringstatechange();

        chat.listenerCandidateAdd((iceCandidate: any) => {
          ws.emit("iceCandidate", { iceCandidate, toId: callingInfo.fromId });
        });

        chat.listenerAddStream((stream: any) => {
          if (remoteVideoRef.current) {
            remoteVideoRef.current.srcObject = stream;
          }
        });

        const answer = await chat.createAnswer(callingInfo.offer);

        ws.emit("answer", { answer, toId: callingInfo.fromId });
      });
      ws.on("update_robot_list", ({ robotList }) => {
        setRobotList(robotList);
      });
    }
  }, [ws]);
  const connectDrive = (driveId: string) => {
    console.log("connectDrive", driveId);
    ws &&
    ws.emit(
        "connect_drive",
        {
          driveId,
        },
        (data: any) => {
          console.log("data", data);
        }
    );
  };

  return (
      <div>
        {robotList &&
            robotList.map((i) => {
              return (
                  <div key={i.name}>
                    robot {i.name}
                    <button
                        onClick={() => {
                          connectDrive(i.id);
                        }}
                    >
                      connect
                    </button>
                  </div>
              );
            })}
        <video width={300} height={200} autoPlay={true} ref={remoteVideoRef} />
      </div>
  );
};

export const Robot: React.FC<{
  robotInfo: {
    id: string;
    name: string;
  };
  onRobotGetMessage: (event: MessageEvent) => void;
  getLocalMedia?: () => Promise<MediaStream>;
}> = ({ robotInfo, getLocalMedia, onRobotGetMessage }) => {
  const ws = useWS("/webrtc", { ...robotInfo, isRobot: true });
  const chat = new VideoChat();
  useEffect(() => {
    if (ws) {
      ws.on("create_webrtc", async (data) => {
        await chat.init(ws, getLocalMedia);

        chat.createLocalPeer();

        chat.createDataChannel(onRobotGetMessage);

        chat.addTrack();

        chat.listenerGatheringstatechange();

        chat.listenerCandidateAdd((iceCandidate: any) => {
          ws.emit("iceCandidate", {
            iceCandidate,
            toId: data.fromId,
          });
        });

        const offer = await chat.createOffer();

        ws.emit("offer", { offer, toId: data.fromId });
      });
    }
  }, [ws]);

  return (
      <div>
        robot {robotInfo.name}
        <button
            onClick={() => {
              chat.sendData("robot message");
            }}
        >
          send data
        </button>
      </div>
  );
};
