const cors = require('cors');
const express = require('express');
const path = require('path');
const app = express().use(express.static(path.join(__dirname,'build')));
const server = require('http').createServer(app);
const io = require('socket.io')(server, {
	cors : {
		origin: "*",
		methods : ["GET","POST"],
	}
});
const port = process.env.PORT || 4001;

rooms = {} //contains room info timer host and turn
users = {} //contains what room user is in

/** {               <--- room should look like this
 * 	name : string,
 *	host : sessionID,
 *	turn : string,
 *	players : [], <--- list of player ids not usernames
 *	quantity : {total, wolf, villager, seer, doctor}
 *	timer : int,
 *	timertime : int,
 *	votecount: int,
 *	votes : {} // make it a dictionary key = one voted id value = number of votes
 * }
 *
 * 
 */

/** Please create async task for game start since
 * while loop is actually thread blocking I reckon
 * therefore causing events not to listen
 * probably why my python script didn't work
 *  - Me but like yesterday
 * FIXED
 * - Me but like today or some days ago
 * 
 * Fix disconnect on host when in game causing
 * whole server to crash
 * - Me but the other day
 * FIXED
*/

const turns = {
	"wolf" : "doctor",
	"doctor" : "seer",
	"seer" : "villager",
	"villager" : "wolf"
}

function shuffle(list) {
	for (let i = list.length - 1; i > 0 ; i--) {
		const j = Math.floor(Math.random() * (i + 1));
		[ list[j], list[i] ] = [ list[i], list[j] ];
	}
	return list
}

function choice(choices) {
	var index = (Math.floor(Math.random() * choices.length));
	return choices[index];
}

function sleep(ms) {
	return 	new Promise(resolve => setTimeout(() => {resolve()},ms));
}
app.get("/", (req, res) => {
	res.sendFile(path.join(__dirname, 'build','index.html'));
}); //send website made by reactjs


io.on("connection", (socket) => {
	const sessionID = socket.id;
	
	users[sessionID] = {
		username : null,
		room : null,
		role : null,
		voted : false,

	};
	console.log(`user, ${sessionID} connected`);
	socket.emit("response", {id : sessionID}); //maybe save for cookie on client side if disconnect
	socket.on("sendteammessage", (data) => {
		const userroom = rooms[users[sessionID]["room"]];
		const role = users[sessionID]["role"];
		const message = data["msg"];
		if (role === "dead" || role === "villager") return;
		for (const player of userroom["quantity"][role])
			io.to(player).emit("recievemessage", {msg : message, username : users[sessionID]["username"], team:true});
	});
	socket.on("sendmessage", (data) => {
		const userroom = rooms[users[sessionID]["room"]];
		const message = data["msg"];
		for (const player of userroom["players"]) {
			io.to(player).emit("recievemessage", {msg : message, username: users[sessionID]["username"], team : false}); //send message to everyone even user who sent it
		}
	});
	socket.on("getroomname", (callback) => { //accidently calling before defining oops
		const roomname = rooms[users[sessionID]["room"]]["name"];
		return callback(roomname);	
	});
	socket.on("disconnect", (data) => {
		const userroom = rooms[users[sessionID]["room"]];
		if (userroom) {
			if (userroom["host"] === sessionID) {
				for (const player of userroom["players"]) {
					if (player === sessionID || !users[player]["room"]) continue;	//if not host and not player that has been deleted already
					socket.to(player).emit("hostdisconnect");
					users[player]["room"] = null;
					users[player]["role"] = null;
				}
				if (rooms[users[sessionID]["room"]]["playing"]) {
					rooms[users[sessionID]["room"]]["deletion"] = true;
					rooms[users[sessionID]["room"]]["timertime"] = 0;
					rooms[users[sessionID]["room"]]["players"] = [];
					rooms[users[sessionID]["room"]]["votes"] = {};
				} else {
					delete rooms[users[sessionID]["room"]];
				}
			} else {
				if (userroom["playing"]) {
					if (!users[sessionID]["voted"] && (userroom["turn"] === users[sessionID]["role"] || userroom["turn"] === "villager")) userroom["votecount"]++; //increase vote count therefore not hogging the game
					if (userroom["votecount"] >= userroom["quantity"]["total"] || userroom["votecount"] >= userroom["quantity"][userroom["turn"]].length && userroom["turn"] !== "villager") userroom["timertime"] = 0; //if everyone in role voted
					userroom["quantity"][users[sessionID]["role"]].splice(userroom["quantity"][users[sessionID]["role"]].indexOf(sessionID),1); //decrease role total therefore less vote count
					if (users[sessionID]["role"] !== "villager")
						userroom["quantity"]["villager"].splice(userroom["quantity"]["villager"].indexOf(sessionID),1);
					playerlist = []
					for (const player of userroom["players"]) {
						if (player === userroom["host"]) continue;
						playerlist.push({id : player, username : users[player]["username"]})
					}
					io.to(userroom["host"]).emit("updateplayerconfig", {playerlist : playerlist}); //update ban kick list
				}
				// note to self socketio does not allow to send packets of array type
				userroom["players"].splice(userroom["players"].indexOf(sessionID),1); //remove player id
				userroom["quantity"]["total"]--; //decrease total
				for (const player of userroom["players"]) io.to(player).emit("removeplayerfromlist", {username:users[sessionID]["username"]});
			}
		}
		delete users[sessionID]; // finally delete the user from database
	})
	socket.on("roomrefresh", (callback) => {
		var roomlist = [];
		for (const [key,value] of Object.entries(rooms)) {
			if (!value["playing"]) roomlist.push({id:key,name:value["name"]});
		}
		return callback({rooms: roomlist}); //return roomlist
	});
	socket.on("getplayerlist", (callback) => {
		room = users[sessionID]["room"]
		roomidlist = rooms[room]["players"]
		playerlist = []
		for (const player of roomidlist) {
			playerlist.push(users[player]["username"])
		}
		return callback(playerlist)
	});
	socket.on("getrole", (callback) => {
		chosenrole = users[sessionID]["role"];
		return callback({role : chosenrole});
	});
	socket.on("getplayers", (callback) => { //please remove players that are in nearlydead list
		room = users[sessionID]["room"];
		if (rooms[room]["turn"] === "wolf") {
			playeridlist = rooms[room]["quantity"]["villager"];
			console.log("first condition passed",playeridlist)
		} else {
			playeridlist = rooms[room]["quantity"]["villager"].concat(rooms[room]["quantity"]["wolf"]);
			playeridlist = shuffle(playeridlist); //shuffle because too obvious
			if (rooms[room]["turn"] !== "doctor")
				playeridlist.splice(playeridlist.indexOf(sessionID), 1);
			console.log("second condition passed",playeridlist)
		}
		playerlist = []
		for (id of playeridlist) {
			if (id === sessionID) 
			{const username = `(Yourself) ${users[id]["username"]}`;
		} else {
				const username = users[id]["username"];
			}
			playerlist.push({username : username, id : id});
		}
		callback({players : playerlist});
	});
	socket.on("vote", (data) => {
		if (users[sessionID]["room"] && !users[sessionID]["voted"]) {
			const userroom = rooms[users[sessionID]["room"]];
			if (userroom["turn"] === users[sessionID]["role"] || userroom["turn"] === "villager") {
				if (!userroom["turn"] === "villager") {
					for (const player of userroom["players"]) {
						io.to(player).emit("removefromlist", data["id"]);
					}
				}
				userroom["votecount"]++;
				if (userroom["votes"][data["id"]]) {
					userroom["votes"][data["id"]]++
				} else {
					userroom["votes"][data["id"]] = 1
				}
				console.log(userroom["votecount"],userroom["quantity"][userroom["turn"]].length)
				if (userroom["votecount"] === userroom["quantity"]["total"] || userroom["votecount"] === userroom["quantity"][userroom["turn"]].length && userroom["turn"] !== "villager")
					userroom["timertime"] = 0; //if everyone in role voted
			}
		}
	});
	socket.on("kickbanplayer", (data) => {
		if (!Object.keys(users).includes(data["id"])) return; //if user does not exist
		const userroom = rooms[users[sessionID]["room"]];
		const removeplayer = data["id"];
		const playerrole = users[removeplayer]["role"];
		if (!userroom["players"].includes(removeplayer)) return; //just in case if clicked multiple times
		userroom["players"].splice(userroom["players"].indexOf(removeplayer),1); //remove player id
		userroom["quantity"]["total"]--; //decrease total
		if (!users[removeplayer]["voted"] && userroom["turn"] === playerrole) userroom["votecount"]++; //increase vote count therefore not hogging the game
		if (userroom["votecount"] >= userroom["quantity"]["total"] || userroom["votecount"] >= userroom["quantity"][userroom["turn"]].length && userroom["turn"] !== "villager") userroom["timertime"] = 0; //if everyone in role voted
		playerlist = [];
		for (const player of userroom["players"]) {
			if (player === userroom["host"]) continue;
			playerlist.push({id : player, username : users[player]["username"]});
		}
		socket.emit("updateplayerconfig", playerlist); //update ban kick list
		if (data["type"] === "ban")
			userroom["banlist"].push(removeplayer)
		userroom["quantity"][playerrole].splice(userroom["quantity"][playerrole].indexOf(removeplayer),1);
		if (playerrole !== "villager")
			userroom["quantity"]["villager"].splice(userroom["quantity"]["villager"].indexOf(removeplayer),1);
		for (const player of userroom["players"])
			io.to(player).emit("removeplayerfromlist", {username:users[removeplayer]["username"]});
		users[removeplayer]["room"] = null;
		io.to(removeplayer).emit((data["type"] === "kick") ? "kicked" : "banned")
	});
	socket.on("leaveroom", (data) => {
		const userroom = rooms[users[sessionID]["room"]]
		if (!userroom) return; //prevent crash
		if (userroom["host"] === sessionID) { //if host
			for (const player of userroom["players"]) {
				console.log("first condition passed")
				if (userroom["host"] === player) continue;
				io.to(player).emit("hostdisconnect"); //even host itself
			}
			if (rooms[users[sessionID]["room"]]["playing"]) {
				rooms[users[sessionID]]["deletion"] = true;
				rooms[users[sessionID]]["timertime"] = 0;
				rooms[users[sessionID]]["players"] = [];
				rooms[users[sessionID]]["votes"] = {};
			} else {
				delete rooms[users[sessionID]["room"]];
			}
			users[sessionID]["room"] = null;
			users[sessionID]["role"] = null;
		} else { //if player
			userroom["players"].splice(userroom["players"].indexOf(sessionID),1); //remove player id
			userroom["quantity"]["total"]--; //decrease total
			users[sessionID]["room"] = null;
			users[sessionID]["role"] = null;
			for (const player of userroom["players"]) io.to(player).emit("removeplayerfromlist", {username:users[sessionID]["username"]});
		}
	});
	socket.on("joingame", (data, callback) => {
		const room = data["room"];
		if (!rooms[room]) return;
		if (rooms[room]["playing"]) return;
		for (const player of rooms[room]["players"]) {
			if (users[player]["username"] === data["username"] || data["username"] === "SYSTEM") {
				callback("username taken");
				return;
			}
		}
		if (!data["username"]) {
			callback("no username");
			return;
		}
		if (rooms[room]["banlist"].includes(sessionID)) {
			callback("banned");
			return;
		}
		users[sessionID]["username"] = data["username"];
		users[sessionID]["room"] = room;
		rooms[room]["players"].push(sessionID);
		rooms[room]["quantity"]["total"]++
		for (const player of rooms[room]["players"]) {
			io.to(player).emit("updateplayerlist", {
				username : data["username"]
			});
		}
		callback("success");
	});
	socket.on("hostgame", (data) => {
		users[sessionID]["username"] = data["username"];
		roomid = sessionID + Date.now();
		users[sessionID]["room"] = roomid;
		rooms[roomid] = {
			name : users[sessionID]["username"],
			host : sessionID,
			players : [sessionID],
			turn : "waiting",
			quantity : {
				"total" : 1,
				"wolf" : [],
				"doctor" : [],
				"seer" : [],
				"villager" : [],
				"nearlydead" : [] //for doctor revial once villagers no more nearlydead
				},
			banlist : [],
			timer : null,
			timertime : null,
			votes : {},
			votecount: 0,
			playing : false,
			deletion : false//mark for deletion
		};
	});
	socket.on("startgame", (data) => {
		const userroom = rooms[users[sessionID]["room"]];
		userroom["timer"] = data["timer"];
		console.log("host attampting to start game")
		if (sessionID === userroom["host"] && userroom["players"].length >= 5) {
		let Game = new Promise(async (resolve, reject) => {
			console.log(`${sessionID}:${users[sessionID]["username"]} has started room, ${users[sessionID]["room"]}`);
			players = await userroom["players"].map((x) => x); //cause references
			const numberwolves = Math.floor(userroom["quantity"]["total"] / 5);
			const numberdoctors = Math.floor(userroom["quantity"]["total"] / 5);
			const numberseers = Math.floor(userroom["quantity"]["total"] / 5);
			for (let wolf=0;wolf<numberwolves;wolf++) {
				chosen = choice(players);
				await players.splice(players.indexOf(chosen),1); //isolate wolves from players and other roles
				users[chosen]["role"] = "wolf";
				await userroom["quantity"]["wolf"].push(chosen);
			}
			for (let doctor=0;doctor<numberdoctors;doctor++) {
				chosen = choice(players);
				await players.splice(players.indexOf(chosen),1);
				users[chosen]["role"] = "doctor";
				userroom["quantity"]["doctor"].push(chosen);
			}
			for (let drunk=0;drunk<0;drunk++) { //add later
				chosen = choice(players);
				await players.splice(players.indexOf(chosen),1);
				users[chosen]["role"] = "drunk";
			}
			for (let seer=0;seer<numberseers;seer++) {
				chosen = choice(players);
				users[chosen]["role"] = "seer";
				await players.splice(players.indexOf(chosen),1);
				userroom["quantity"]["seer"].push(chosen);
			}
			console.log(players)
			for (const player of userroom["players"]) {
				if (!users[player]["role"]) //check if already assigned a role
					users[player]["role"] = "villager";
				if (!userroom["quantity"]["wolf"].includes(player)) //check if not a wolf yes push all roles there
					userroom["quantity"]["villager"].push(player);
			}
			console.log("villager list", userroom["quantity"]["villager"])
			userroom["turn"] = "wolf"; //start off from wolf
			userroom["playing"] = true; //playing right now
			for (const player of userroom["players"]) await io.to(player).emit("gamestarted");
			playerlist = []
			for (const player of userroom["players"]) {
				if (player === sessionID) continue;
				playerlist.push({id : player, name : users[player]["username"]})
			}
			await socket.emit("updateplayerconfig", playerlist);
			while (userroom["quantity"]["villager"].length > 0 && userroom["quantity"]["wolf"].length > 0) { //to fix while loop blocking async please
				if (userroom["turn"] === "villager") {
					for (const  deadplayer of userroom["quantity"]["nearlydead"]) {
						console.log(userroom["quantity"]["nearlydead"])
						const userrole = users[deadplayer]["role"];
						if (userrole !== "villager")
							await userroom["quantity"]["villager"].splice(userroom["quantity"]["villager"].indexOf(deadplayer),1);
						await userroom["quantity"][userrole].splice(userroom["quantity"][userrole].indexOf(deadplayer),1);
						userroom["quantity"]["total"]--;	
						users[deadplayer]["role"] = "dead";
						for (const player of userroom["players"])
							io.to(player).emit("recievemessage",{username: "SYSTEM", msg: `${users[deadplayer]["username"]} has died from a werewolf attack!`});
					}
					console.log("nearlydead", userroom["quantity"]["nearlydead"])
					console.log("villager", userroom["quantity"]["villager"])
					userroom["quantity"]["nearlydead"] = [] //clear it out
				}
				if (!userroom["quantity"][userroom["turn"]].length > 0) { //skip if role is empty
					userroom["turn"] = turns[userroom["turn"]];
					continue;
				}
				console.log(`turn is ${userroom["turn"]}`)
				timerends = userroom["timer"] * 1000 + Date.now(); //unix time plus timer
				for (var player of userroom["players"]) await io.to(player).emit("startturn", {timer : timerends, turn : userroom["turn"] });
				userroom["timertime"] = Math.floor((timerends - Date.now()) / 1000);
				console.log(userroom["timertime"])
				while (userroom["timertime"] > 0) {
					await sleep(1000).then(() => {
						userroom["timertime"]--
					});
				}
				if (userroom["votes"])
				switch (userroom["turn"]) {
						case "villager":
							if (Object.keys(userroom["votes"]).length === 0) break; //if no one voted skip
							for (x=0;x<userroom["quantity"]["wolf"].length;x++) {
								const userid = Object.entries(userroom["votes"]).reduce((a, b) => a[1] > b[1] ? a : b)[0] //find biggest
								const userrole = users[userid]["role"]
								if (userrole !== "wolf") {
									await userroom["quantity"]["villager"].splice(userroom["quantity"]["villager"].indexOf(userid),1);
								}
								if (userrole !== "villager") {
									await userroom["quantity"][userrole].splice(userroom["quantity"][userrole].indexOf(userid),1);
								}
								for (const player of userroom["players"])
									io.to(player).emit("recievemessage", {username : "SYSTEM", msg : `${users[userid]["username"]} was voted to be killed!`});
								userroom["quantity"]["total"]--;
								users[userid]["role"] = "dead";
								delete userroom["votes"][userid]; //delete from vote once done
							}			
							break;
						case "wolf":
							for (const votedplayer in userroom["votes"]) {
								userroom["quantity"]["nearlydead"].push(votedplayer) //add to nearly dead for doc to revive
							}
							break;
						case "doctor":
							for (const votedplayer in userroom["votes"]) {
								const userrole = users[votedplayer]["role"];
								if (userroom["quantity"]["nearlydead"].includes(votedplayer)) {
									userroom["quantity"]["nearlydead"].splice(userroom["quantity"]["nearlydead"].indexOf(votedplayer),1);
									for (const player of userroom["players"])
										io.to(player).emit("recievemessage",{username: "SYSTEM", msg: `${users[votedplayer]["username"]} has mysteriously been revived!`});
								}
							}
							break;
						case "seer":
							for (const votedplayer in userroom["votes"]) {
								const userrole = users[votedplayer]["role"];
								const username = users[votedplayer]["username"];
								for (const seer of userroom["quantity"]["seer"]) {
									io.to(seer).emit("recievemessage", {username: "SYSTEM" ,msg : `${username} is a ${userrole}`});
								}
							}
							break;
				}
				for (player of userroom["players"])
					users[player]["voted"] = false;
				userroom["turn"] = turns[userroom["turn"]];
				userroom["votecount"] = 0; //change and reset
				userroom["votes"] = {} // i hate this
				if (userroom["deletion"]) {
					delete userroom	
					resolve() //end game if marked for deletion
				}

			}
			console.log(!userroom["quantity"]["villager"].length?"wolves win":"people win")
			console.log(userroom["quantity"]["villager"])
			for (const player of userroom["players"]) {
				users[player]["role"] = null;
				users[player]["voted"] = null;
				await io.to(player).emit(!userroom["quantity"]["villager"].length?"wolveswin": "peoplewin");
			}
			userroom["turn"] = "waiting";
			userroom["playing"] = false;
			userroom["quantity"] = {
				"total" : userroom["players"].length,
				"wolf" : [],
				"doctor" : [],
				"seer" : [],
				"villager" : [],
				"nearlydead" : []
				};
			resolve();
			})
		}
	});
}); //get connection from client then keep track of it or something idk

//listen on port

server.listen(port, () => {
	console.log(`server is on ${port}`);
	});
