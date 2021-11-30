import './App.css';
import io from "../node_modules/socket.io-client/dist/socket.io.js";
import React from 'react';
const website = "http://127.0.0.1:4001";

class DialogBox extends React.Component { //always create a reference when accessing state React.createRef()
	constructor(props) {
		super(props)
		this.state = {
			inittime : this.props.time,
			timeleft: null,
			show: false,
		}
		this.handleClose = this.handleClose.bind(this);
		this.countDown = this.countDown.bind(this);
		this.show = this.show.bind(this);
	}

	show() {
		this.setState({show : true});
		if (this.state.inittime) {
			this.setState({timeleft : this.state.inittime});
			this.timer = setInterval(this.countDown, 1000) //assuming its not miliseconds inputted in code
		}
	}

	countDown() {
		const newtime = this.state.timeleft - 1;
		if (newtime === 0) {
			this.handleClose();
		} else {
			this.setState({timeleft : newtime});
		}
	}

	handleClose() {
		clearInterval(this.timer); //clear timer even if its stopped still do
		this.setState({show : false});
		if (this.props.function)
			this.props.function();
	}
	render() {
		if (!this.state.show) return null;
		return (
				<div className="modal">
					<div className="modal-content">
						<div className="modal-header">
							<h4 className="modal-title">{this.props.title}</h4>
						</div>
						<div className="modal-body">
							{this.props.body}
							{this.timer && <><br/>This will close in {this.state.timeleft}</>}
						</div>
						<div className="modal-footer">
							<button className="button" onClick={this.handleClose}>Close</button>
						</div>
					</div>
			</div>
		);
	}
}

class PlayerList extends React.Component {
	constructor (props) {
		super(props);
		this.state = {
			playerlist : []
		}
	}
	componentDidMount() {
		const socket = this.props.socket;
		socket.emit("getplayerlist", (response) => {
			this.setState({playerlist : response});
		});
		socket.on("updateplayerlist", (data) => {
			this.setState(prevState => ({playerlist : [...prevState.playerlist, data["username"]]}));
		});
		socket.on("removeplayerfromlist", (data) => {
			this.setState(prevState => ({playerlist : prevState.playerlist.filter(name => name != data["username"])}));
		});
	}
	render() {
		return (
					<div className="playerlist">
						{this.state.playerlist.map(value => <div className="playerlistname">{value}</div>)}
					</div>
		);
	}
}

class Chat extends React.Component {
	constructor (props) {
		super(props);
		this.changeParentVar = props.changeparentvar;
		this.readParentVar = props.readparentvar;
		this.state = {
			chatvalue : "",
			msghistory : [],
			teamchat : false,
		}
		this.handleChatInput = this.handleChatInput.bind(this);
		this.handleChatSend = this.handleChatSend.bind(this);
		this.handleInputPress = this.handleInputPress.bind(this);
		this.handleTeamChat = this.handleTeamChat.bind(this);
	}
	handleInputPress(event) {
		if (event.key === "Enter") {
			this.handleChatSend();
		}
	}
	handleChatInput(event) {
		this.setState({chatvalue : event.target.value});
	}
	handleTeamChat(event) {
		this.setState({teamchat : event.target.checked});
	}
	handleChatSend() {
		const socket = this.props.socket;
		if (this.state.teamchat) {
			socket.emit("sendteammessage", {msg : this.state.chatvalue});
		} else {
			socket.emit("sendmessage", {msg : this.state.chatvalue});
		}
		this.setState({chatvalue : ""});
	}
	componentDidMount() {
		const socket = this.props.socket;
		socket.on("recievemessage", (data) => {
			const msg = {
				team : data["team"],
				msg : data["msg"],
				username : data["username"]
			}
			console.log(msg)
			if (this.state.msghistory.length > 25)
				this.setState({msghistory : []});
			this.setState(prevState => ({msghistory : [...prevState.msghistory, msg]}));
		});
	}
	render() {
		return (
			<div className="chatcontainer">
				<div className="chathistory">
					{this.state.msghistory.map(value => <div className="message"><span  style={value.team ? {color: "red"} : {}}>{value.username}</span>: {value.msg}</div>)}
				</div>
				<div className="chatuserbox">
					<input placeholder="Type here" className="input" id="chatinput" value={this.state.chatvalue} onChange={this.handleChatInput} onKeyPress={this.handleInputPress} />
					<button className="button" id="chatbutton" onClick={this.handleChatSend}>Send</button>
					{ this.readParentVar("role") && this.readParentVar("role") !== "villager" && this.readParentVar("role") !== "dead" && <label className="switchcontainer">Team chat: <input type="checkbox" className="switch" onChange={this.handleTeamChat}/></label>}
				</div>
			</div>
		);
	}
}

class GameScreen extends React.Component {
	constructor (props) {
		super(props);
		/*Get server data here*/
		this.changeParentVar = props.changeparentvar;
		this.readParentVar = props.readparentvar;
		this.dialogVillagers = props.dialogVillagers;
		this.dialogWolfs = props.dialogWolfs;
		this.state = {
			timeleft: null,
			selectedplayer : "",
			players : [], //has key value and username so people can have two usernames
			role : "villager",
			turn : "villager",
			voted : false,
			timer : null,
		};
		this.countDown = this.countDown.bind(this);
		this.handleSelectPlayer = this.handleSelectPlayer.bind(this);
		this.handleChangeSelected = this.handleChangeSelected.bind(this);
	}
	handleSelectPlayer() {
		const socket = this.props.socket;
		if (this.state.selectedplayer) {
			socket.emit("vote", {id : this.state.selectedplayer});
			this.setState({voted : true});
		}
	}
	handleChangeSelected(event) {
		this.setState({selectedplayer : event.target.value});
	}
	countDown() {
		var newtime = this.state.timeleft - 1;
		this.setState({
			timeleft : newtime,
		});
		if (newtime === 0) {
			clearInterval(this.timer);
		}
	}
	componentDidMount() {
		const socket = this.props.socket;
		console.log("getting roles");
		socket.on("startturn", (data) => {
			clearInterval(this.timer);
			this.setState({voted : false});
			const time = Math.ceil((data["timer"] - Date.now()) / 1000); //fix not async timer
			console.log("time", time)
			this.setState({timeleft : time});
			this.timer = setInterval(this.countDown, 1000);
			const turn = data["turn"];
			this.setState({turn: turn}); //bruh
			console.log("game starting timer done turn done");
			socket.emit("getrole", (data) => {
				const role = data["role"];
				this.setState({role : role});
				this.changeParentVar("role", role);
				console.log(data);
				if (turn === role || turn === "villager") {
					console.log("getting players")
					socket.emit("getplayers", (data) => {
						this.setState({players : data["players"]});
						console.log("got players",data);
					});
					console.log("passed the socket emit getplayers")
					}
				});
			}
		);
		socket.on("removefromlist", (data) => {
			this.setState({players : this.state.players.filter((player) => (player !== data["id"]))})
		});
		socket.on("wolveswin", (data) => {
			this.dialogWolfs.current.show()
		});
		socket.on("peoplewin", (data) => {
			this.dialogVillagers.current.show()
		});
	}
	render() {
		const role = this.state.role;
		const turn = this.state.turn;
		var message;
		switch (turn) {
			case "wolf":
				message = "Choose who to kill"
				break;
			case "doctor":
				message = "Choose who to revive"
				break;
			case "villager":
				message = "Who is the suspicious imposter?"
				break;
			case "seer":
				message = "Which identity shall you reveal?"
				break;
			default:
				message = "unhandled or dead message"
		} 
		if (turn === "villager" && role !== "dead" || role === turn) {
			return (
				<div className="game">
					<p id="gamestatus">{message}</p>
					{	this.state.voted ? 
							"You already voted" : 
							<select className="input" id="gameselect" onChange={this.handleChangeSelected} >
								<option disabled selected hidden>Choose Player</option>
									{this.state.players.map((value) => (
										<option value={value.id}>{value.username}</option>
									))}
							</select>
					}	
					{ !this.state.voted && <button className="button" id="gameselectbutton" onClick={this.handleSelectPlayer}>Select</button>}
					<p>You have {this.state.timeleft} seconds left</p>
				</div>
			);
		} else if (role !== "dead") {
			return (
				<div className="game">
					<p>Please wait for your turn</p>
				</div>
			);
		} else {
			return(
				<div className="game">
					<p>You are dead cry about it lol</p>
				</div>
			);
		}
		}
}
class InGame extends React.Component {
	constructor (props) {
		super(props);
		this.state = {
			configlist : [],
			selectedplayer : ""
		};
		this.changeParentVar = props.changeparentvar;
		this.readParentVar = props.readparentvar;
		this.handleChosenPlayer = this.handleChosenPlayer.bind(this);
		this.handleKickPlayer = this.handleKickPlayer.bind(this);
		this.handleBanPlayer = this.handleBanPlayer.bind(this);
		this.dialogVillagers = React.createRef();
		this.dialogWolfs = React.createRef();
		this.dialogKicked = React.createRef();
		this.dialogBanned = React.createRef();
		this.dialogHostDisconnect = React.createRef();
	}
	componentDidMount() {
		const socket = this.props.socket;
		socket.on("hostdisconnect", (data) => {
			this.dialogHostDisconnect.current.show()
		});
		socket.on("banned", (data) => {
			this.dialogBanned.current.show()
		});
		socket.on("kicked", (data) => {
			this.dialogKicked.current.show()
		});
		if (this.readParentVar("host")) {
			console.log("passed");
			socket.on("updateplayerconfig", (data) => {
				console.log("got data")
				this.setState({configlist : data});
			});

		}
	}
	handleChosenPlayer(event) {
		this.setState({
			selectedplayer : event.target.value,
		});
	}
	handleKickPlayer() {
		const socket = this.props.socket;
		socket.emit("kickbanplayer",{id : this.state.selectedplayer, type : "kick"});
	}
	handleBanPlayer() {
		const socket = this.props.socket;
		socket.emit("kickbanplayer", {id : this.state.selectedplayer, type : "ban"});
	}
	render() {
		return (
			<div className="ingame">
					<PlayerList socket={this.props.socket}/>
				<div className="gamescreen">
					<GameScreen socket={this.props.socket} changeparentvar={this.props.changeparentvar} readparentvar={this.props.readparentvar} dialogWolfs={this.dialogWolfs} dialogVillagers={this.dialogVillagers}/>
				</div>
				<div className="usernamecontainer">
					<p id="ownusername">Username: {this.readParentVar("username")}<br/>Role: {this.readParentVar("role")}</p>
				</div>
					{this.readParentVar("host") &&
					<div className="options"> 
						<select className="input" id="optionsitem optionsinput" onChange={this.handleChosenPlayer}>
							<option value="" disabled selected hidden>Who shall feel your wraith?</option>
							{this.state.configlist.map(value => <option value={value.id}>{value.name}</option>)}
						</select>
						<button className="button" id="optionsitem" onClick={this.handleKickPlayer}>Kick</button>
						<button className="button" id="optionsitem" onClick={this.handleBanPlayer}>Ban</button>				
					</div>
					}
				<Chat socket={this.props.socket} readparentvar={this.readParentVar} changeparentvar={this.changeParentVar}/>
				<DialogBox body="Villagers win!!!!!!!!" title="Team Won" time="10" function={(e) => this.changeParentVar("type", Waiting)} ref={this.dialogVillagers}/>
				<DialogBox body="Wolves win!!!!!!!!!!!" title="Team Won" time="10" function={(e) => this.changeParentVar("type", Waiting)} ref={this.dialogWolfs}/>
				<DialogBox body="The host has disconnected!" title="The host disconnected..." time="10" function={(e) => this.changeParentVar("type", Lobby)} ref={this.dialogHostDisconnect}/>
				<DialogBox body="The host has banned you from the room" title="The host banned you" time="10" function={(e) => this.changeParentVar("type", Lobby)} ref={this.dialogBanned}/>
				<DialogBox body="The host has kicked you from the room" title="The host kicked you" time="10" function={(e) => this.changeParentVar("type", Lobby)} ref={this.dialogKicked}/>
			</div>
		);
	}
}
class Waiting extends React.Component {
	constructor(props) {
		super(props);
		this.changeParentVar = props.changeparentvar;
		this.readParentVar = props.readparentvar;
		this.state = {
			hostname : "", //get hostname from server even if created by host
			host: this.readParentVar("host"),
		};
		this.changeParentVar("role", null);
		this.handleHostStart = this.handleHostStart.bind(this);
		this.handleLeaveGame = this.handleLeaveGame.bind(this);
		this.dialogHostDisconnect = React.createRef();
		console.log(this.dialogHostDisconnect)
	}
	handleHostStart() {
		const socket = this.props.socket;
		socket.emit("startgame",{timer : 30});
	}
	handleLeaveGame() {
		const socket = this.props.socket;
		socket.emit("leaveroom");
		this.changeParentVar("type", Lobby);
	}
	componentDidMount() {
		const socket = this.props.socket;
		socket.emit("getroomname", (response) => {
			this.setState({hostname : response });
		});
		socket.on("gamestarted", (data) => {
			console.log("alerted game started")
			this.changeParentVar("type",InGame);
		});
		socket.on("hostdisconnect", (data) => { //dumb bug reference error after remount
			console.log("host disconnected", this.dialogHostDisconnect)
			this.dialogHostDisconnect.current.show() //returns null and reference error after remount
		});
		console.log("component mounted")	
	}
	render() {
		return (
			<div className="waiting">
				<h1 id="roomname">{this.state.hostname}'s room</h1>
				<PlayerList socket={this.props.socket}/>
				<div className="usernamecontainer">
					<div id="ownusername">Username: {this.readParentVar("username")}</div>
				</div>
				<div className="options">
					<button className="button" id="optionsitem" onClick={this.handleLeaveGame}>Leave Game</button>
					{ this.readParentVar("host") && <button onClick={this.handleHostStart} className="button" id="startgamebutton optionsitem">Start Game</button>}
				</div>
				<Chat socket={this.props.socket } readparentvar={this.readParentVar} changeparentvar={this.changeParentVar}/>
				<DialogBox body="The host has disconnected!" title="The host disconnected..." function={(e) => this.changeParentVar("type", Lobby)} ref={this.dialogHostDisconnect}/>
			</div>
		);
	}
}
class Lobby extends React.Component {
	constructor(props) {
		super(props);
		this.changeParentVar = props.changeparentvar;
		this.readParentVar = props.readparentvar;
		this.state = {
			rooms : [],
			username : this.readParentVar("username"), //save from other sessions
			selectedroom : "",
		};
		this.changeParentVar("role", null);
		this.handleChangeUser = this.handleChangeUser.bind(this);	
		this.handleChangeRoom = this.handleChangeRoom.bind(this);
		this.handleRefresh = this.handleRefresh.bind(this);
		this.HostRoom = this.HostRoom.bind(this);
		this.JoinRoom = this.JoinRoom.bind(this);
		this.dialogRoom = React.createRef();
		this.dialogNoUsername = React.createRef();
		this.dialogUsernameTaken = React.createRef();
		this.dialogBanned = React.createRef();
	}
	handleChangeUser(event) {
		this.setState({
			username : event.target.value,
		});
		console.log(event.target.value);
	}
	handleChangeRoom(event) {
		this.setState({
			selectedroom : event.target.value,
		});
	}
	handleRefresh(event) {
		event.preventDefault(); //i think cancels onsubmit maybe?
		const socket = this.props.socket;
		socket.emit("roomrefresh", (response) => {
			this.setState({rooms:response["rooms"]});
		});
	}
	HostRoom(event) {
		event.preventDefault();
		if (this.state.username) {
			this.changeParentVar("type",Waiting);
			console.log(this.state.username);
			this.changeParentVar("username",this.state.username);
			this.changeParentVar("host", true);
			/*Insert magical shit here*/
			const socket = this.props.socket;
			socket.emit("hostgame", {username: this.state.username});
		} else {
			this.dialogUsername.current.show();
		}
	}
	JoinRoom(event) {
		event.preventDefault();
		if (this.state.selectedroom) { //break if no room stuff
			/*Insert magical shit here*/
			const socket = this.props.socket;
			socket.emit("joingame", {username: this.state.username, room : this.state.selectedroom}, (response) => {
				switch (response) {
					case "success":
						this.changeParentVar("type",Waiting);
						this.changeParentVar("username",this.state.username);
						this.changeParentVar("host", false);
						break;
					case "username taken":
						this.dialogUsernameTaken.current.show();
						break;
					case "no username":
						this.dialogNoUsername.current.show();
						break;
					case "banned":
						this.dialogBanned.current.show();
						break;
				}
			});
		} else {
			this.dialogRoom.current.show();
		}	
	}
	componentDidMount() {
		/*for socketio listeners*/
		const socket = this.props.socket
		socket.emit("roomrefresh", (response) => {
			this.setState({rooms:response["rooms"]});
		});
	}
	render() {
	return (
	<div className="lobby">
		<div className="menu">
			<h1 id="title">WereWoof</h1>
			<form className="select" onSubmit={this.handleSubmit}>
				<div id="Room">
					<label>Room: </label>
					<select onChange={this.handleChangeRoom}className="input">
						<option value="" disabled selected hidden>{this.state.rooms.length > 0 ? "Choose your room" : "No rooms avaliable!"}</option>
						{this.state.rooms.map((value) => <option value={value.id}>{value.name}</option>)}
					</select>
					<button className="button" id="lobbybutton" onClick={this.handleRefresh}>Refresh</button>
				</div>
				<div id="Username">
					<label>Username: </label>
					<input type="text" className="input" placeholder= "username" maxLength="10" value={this.state.username} onChange={this.handleChangeUser}/>
					<button className="button" id="lobbybutton" onClick={this.JoinRoom}>Join</button>
					<button className="button" id="lobbybutton" onClick={this.HostRoom}>Host</button>
				</div>
			</form>
			<DialogBox body="You haven't chosen a room!" title="Bruh what you doing?" ref={this.dialogRoom}/>
			<DialogBox body="You have a empty username!" title="Bruh what you doing?" ref={this.dialogNoUsername}/>
			<DialogBox body="Username is already taken!" title="Bruh what you doing?" ref={this.dialogUsernameTaken}/>
			<DialogBox body="The host has banned you from the room" title="The host banned you" ref={this.dialogBanned}/>
		</div>
		<div id="info">
			<p id="info">Sample Text blah blah important stuff!</p>
		</div>
	</div>
	);
	}
}
class Game extends React.Component {
	constructor(props) {
		super(props);
		this.state = {
			type:Lobby,
			id:null,
			host:false,
			username:"",
			role: null,
			socket: io(website) //global socket
		}; //get special id from server
		this.changeParentVar = this.changeParentVar.bind(this);
		this.readParentVar = this.readParentVar.bind(this);
		this.debug = this.debug.bind(this);
	}
	changeParentVar(key,value) {
		var variable = {};
		variable[key] = value;
		this.setState(variable);
	}
	readParentVar(key) {
			return this.state[key]
	
	}
	componentDidMount() {
		//this.setState({socket: io(website)});
		const socket = this.state.socket;
		socket.once("response", (response) => {
			this.setState({id : response.id});
		});
		//document.addEventListener("keydown", this.debug); //debug 
	}
	debug(event) {
		console.log(event.keyCode)
		if (event.keyCode === 13) this.setState({type: InGame});
		if (event.keyCode === 220) this.setState({type : Waiting});
	}
	render() {

		return <this.state.type socket= {this.state.socket} readparentvar = {this.readParentVar} changeparentvar={this.changeParentVar}/>
	}
} 
function App() {
  return (
    <div className="App">
	<Game />
    </div>
  );
}

export default App;
