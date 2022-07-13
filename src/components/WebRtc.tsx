import React, { useEffect, useRef, useState } from "react";
import io, { Socket } from "socket.io-client";

type UserInfo={
  id:string,
  name:string
}
type DataChannelData={
  type:"init"|"data"
  data:any
}

class VideoChat {
  private peer: null | RTCPeerConnection;
  private ws: Socket | null;
  public localMedia: null | MediaStream;
  public remoteMedia: null | MediaStream;
  private rtcConfig: RTCConfiguration;
  private dataChannel: RTCDataChannel | null;
  public dataChannelConnected: Boolean;
  public selfInfo: UserInfo|null;
  public remoteInfo: UserInfo|null;

  constructor() {
    this.selfInfo=null
    this.remoteInfo=null
    this.ws = null;
    this.peer = null;
    this.localMedia = null;
    this.remoteMedia = null;
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
      console.log("remote add iceCandidate");
      this.peer && this.peer.addIceCandidate(new RTCIceCandidate(iceCandidate));
    });
    // 呼叫被接受
    this.ws.on("answer", ({ answer }: any) => {
      console.log("setRemoteDescription");
      this.peer && this.peer.setRemoteDescription(answer);
    });
    this.localMedia = await (getLocalMedia
        ? getLocalMedia()
        : this.getLocalMedia());
  }

  setSelfInfo(info:UserInfo){
    this.selfInfo =info
  }
  sendSelfInfo(){
    this.dataChannel?.send(JSON.stringify({type:"init",data:this.selfInfo}))
  }

  setRemoteInfo(info:UserInfo){
    this.remoteInfo =info
  }

  // 创建RTC
  createLocalPeer() {
    this.peer = new RTCPeerConnection(this.rtcConfig);
    this.peer.addEventListener("icecandidateerror",(e)=>{
      console.log("icecandidateerror",e)
    })
    return this;
  }

  // 将媒体流加入通信
  addTrack() {
    if (!this.peer || !this.localMedia) return;
    // this.localMedia.getTracks().forEach(track => this.peer.addTrack(track, this.localMedia));
    // @ts-ignore
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

  listenerAddStream() {
    this.peer?.addEventListener("addstream", (event: any) => {
      this.remoteMedia=event.stream
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
        console.log("send candidate to remote");
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
  createDataChannel(onMessage: (event: DataChannelData) => void, label = "data") {
    console.log("createDataChannel");
    if (this.peer) {
      this.dataChannel = this.peer.createDataChannel(label);
      this.dataChannel.onopen = () => {
        console.log("datachannel open");
        this.dataChannelConnected = true;
        this.sendSelfInfo()
      };
      this.dataChannel.onclose = () => {
        console.log("datachannel close");
        this.dataChannel = null;
        this.dataChannelConnected = false;
      };
      this.dataChannel.onmessage = (event: MessageEvent)=>{
        console.log(this.selfInfo,event)
        const data:DataChannelData = JSON.parse(event.data)
        if (data.type==="init"){
          this.remoteInfo=data.data
        }
        return onMessage(data)
      };
    }
    return this;
  }
  createReceiveDataChannel(onMessage: (data: DataChannelData) => void) {
    console.log("createReceiveDataChannel");
    if (this.peer) {
      this.peer.ondatachannel = (e) => {
        this.dataChannel = e.channel;
        this.dataChannel.onopen = () => {
          console.log("datachannel open");
          this.dataChannelConnected = true;
          this.sendSelfInfo()
        };
        this.dataChannel.onclose = () => {
          console.log("datachannel close");
          this.dataChannel = null;
          this.dataChannelConnected = false;
        };
        this.dataChannel.onmessage = (event: MessageEvent)=>{
          const data:DataChannelData = JSON.parse(event.data)
          if (data.type==="init"){
            this.remoteInfo=data.data
          }
          return onMessage(data)
        };
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
    console.log("ws connecting", import.meta.env.VITE_APP_WEBSOCKET_URL);
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

type ConsoleRobot = { id: string; name: string,chat:VideoChat|null }
export const WebRtcConsole: React.FC<{
  adminInfo?: {
    id: string;
    name: string;
  };
}> = ({ adminInfo = { id: "admin", name: "admin" } }) => {
  const ws = useWS("/webrtc", { ...adminInfo, isRobot: false });
  const [robotList, setRobotList] = useState<ConsoleRobot[]|undefined>();
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    if (ws) {
      ws.on("called", async (callingInfo) => {
        const chat = new VideoChat();
        chat.createLocalPeer();
        chat.setSelfInfo(adminInfo)
        chat.createReceiveDataChannel((data) => {
          console.log("get message from ",chat.remoteInfo?.name,data)
        });
        chat.listenerGatheringstatechange();
        chat.listenerCandidateAdd((iceCandidate: any) => {
          ws.emit("iceCandidate", { iceCandidate, toId: callingInfo.fromId });
        });
        chat.listenerAddStream();
        const answer = await chat.createAnswer(callingInfo.offer);
        ws.emit("answer", { answer, toId: callingInfo.fromId });

        setRobotList((old)=>{
          return old && old.map(i => {
            if (i.id === callingInfo.fromId) {
              i.chat = chat
            }
            return i
          })
        })
      });
      ws.on("update_robot_list", ({ robotList }) => {

        setRobotList((old)=>{
          if (old){
            return robotList.map((i:ConsoleRobot)=>{
              return {...i,chat:old.find((j)=>j.id=i.id)?.chat}
            })
          }
          return  robotList
        });
      });
    }
  }, [ws]);
  const connectDrive = (driveId: string) => {
    ws &&
    ws.emit(
        "connect_drive",
        {
          driveId,
        },
    );
  };
  const disconnectDrive = (driveId: string) => {
    setRobotList((old)=>{
      return old && old.map(i => {
        if (i.id === driveId) {
          i.chat = null
        }
        return i
      })
    })
  };
  return (
      <div>
        {robotList && robotList.length>0?
            robotList.map((i) => {
              return (
                  <CRobot connectDrive={connectDrive} disconnectDrive ={disconnectDrive} robotInfo={i} key={i.id}/>
              )
            }) : "not robot online"}
        <video width={300} height={200} autoPlay={true} ref={remoteVideoRef}/>
      </div>
  );
};

export const CRobot: React.FC<{ connectDrive: (id: string) => void, disconnectDrive: (id: string) => void, robotInfo: ConsoleRobot }>
    = ({connectDrive,disconnectDrive, robotInfo}
) => {
  const remoteVideoRef = useRef<HTMLVideoElement>(null);
  useEffect(() => {
    if (remoteVideoRef.current && robotInfo.chat) {
      remoteVideoRef.current.srcObject = robotInfo.chat!.remoteMedia
    }
  })

  return <div>
    <div key={robotInfo.name}>
      robot[{robotInfo.name}]
      {robotInfo.chat?<button
          onClick={() => {
            disconnectDrive(robotInfo.id);
          }}
      >
        disconnect
      </button>:<button
          onClick={() => {
            connectDrive(robotInfo.id);
          }}
      >
        connect
      </button>}
      <div>
        {robotInfo.chat?.remoteMedia && <video ref={remoteVideoRef} width={300} height={200} autoPlay={true}/>}
      </div>
    </div>
  </div>
}



export const RobotInit = () => {
  const [robotInfo, setRobotInfo] = useState<any>();
  return <div>
    inputRobotName<input id={"robotId"}/>
    <button onClick={() => {
      const t: any = document.getElementById("robotId")
      setRobotInfo({...{
          id: t.value,
          name: t.value
        }})
    }
    }>create robot
    </button>
    {robotInfo && <Robot key={robotInfo.id}
                         robotInfo={robotInfo}/>}
  </div>

}
export const Robot: React.FC<{
  robotInfo: {
    id: string;
    name: string;
  };
  getLocalMedia?: () => Promise<MediaStream>;
}> = ({ robotInfo, getLocalMedia }) => {
  const ws = useWS("/webrtc", { ...robotInfo, isRobot: true });
  const chat = new VideoChat();
  useEffect(() => {
    if (ws) {
      ws.on("create_webrtc", async (data) => {
        await chat.init(ws, getLocalMedia);
        chat.setSelfInfo(robotInfo)
        chat.createLocalPeer();

        chat.createDataChannel((data)=>{
          console.log("get message from ",chat.remoteInfo?.name,data)
        });

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
  }, [ws,robotInfo.id]);

  return (
      <div>
        robot[{robotInfo.name}]
        <input id={"input"}/>
        <button
            onClick={() => {
              // @ts-ignore
              const input:HTMLInputElement = document.getElementById("input")
              input && chat.sendData(JSON.stringify({type:"data",data:input.value}));
              input.value=""
            }}
        >
          send data
        </button>
      </div>
  );
};
