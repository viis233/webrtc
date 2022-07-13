// @ts-ignore
import {BrowserRouter as Router, Route, Switch} from "react-router-dom";
import {Robot, RobotInit, WebRtcConsole} from "./components/WebRtc";

function App() {
    return (
        <Router>
            <Switch>
                <Route exact path="/console">
                    <WebRtcConsole/>
                </Route>
                <Route exact path="/robot">
                    <RobotInit/>
                </Route>
            </Switch>
        </Router>
    )
}

export default App
