import {BrowserRouter as Router, Route, Switch} from "react-router-dom";
import {Robot, WebRtcUser} from "./components/WebRtc";

function App() {
  return (
      <Router>
          <Switch>
              <Route exact path="/">
                  <WebRtcUser />
              </Route>
              <Route exact path="/robot">
                  <Robot
                      onRobotGetMessage={(event: MessageEvent) => {
                          console.log("robot get data", event.data);
                      }}
                      robotInfo={{
                          id: "robot1",
                          name: "robot1",
                      }}
                  />
              </Route>
          </Switch>
      </Router>
  )
}

export default App
