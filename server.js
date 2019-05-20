// @flow

const dgram = require('dgram');
const net = require('net');
const readline = require('readline');
const EventEmitter = require('events');
const ip = require('ip');
const Moniker = require('moniker');

let myName = Moniker.choose();

// console.log(ip.subnet(ip.address()));

const TCP_PORT = 1337;
const UDP_PORT = 6623;

function extractUsername(message) {
	let match = /^HELLO MY NAME IS: (.*)$/m.exec(message);
	return match ? match[1] : null;
}

class Chat extends EventEmitter {
	constructor() {
		super();
		
		this._sockets = new Map();
	}

	start() {
		const tcpServer = net.createServer(async socket => {
			socket.setEncoding('utf8');
			let username = await new Promise(resolve => {
				socket.once('data', message => resolve(extractUsername(message)));
			});
			socket.write(`HELLO MY NAME IS: ${myName}`);

			this._addUser(socket, username);
		});
		tcpServer.listen(TCP_PORT, '0.0.0.0');

		const udpServer = dgram.createSocket('udp4');
		udpServer.on('message', (message, remote) => {
			if (remote.address === ip.address()) return;

			const socket = new net.Socket();
			socket.setEncoding('utf8');
			socket.connect(TCP_PORT, remote.address, async () => {
				socket.write(`HELLO MY NAME IS: ${myName}`);

				let username = await new Promise(resolve => {
					socket.once('data', message => resolve(extractUsername(message)));
				});

				this._addUser(socket, username);
			});
		});

		udpServer.bind(UDP_PORT);
	}

	_addUser(socket, username) {
		socket.on('data', message => {
			this.emit('message', username, message, socket.remoteAddress);
		});

		socket.on('close', () => {
			this.emit('left', username);
			this._sockets.delete(socket);
		});

		this._sockets.set(socket, username);
	}

	postMessage(message) {
		for (let [socket] of this._sockets.entries()) {
			socket.write(message);
		}
	}
}

function tryToReachAnotherUsers() {
	const broadcastAddress = '192.168.43.255';
	const message = Buffer.from('');
	const client = dgram.createSocket('udp4');
	client.bind();
	client.on('listening', function() {
		client.setBroadcast(true);
		client.send(message, 0, message.length, UDP_PORT, broadcastAddress, function(err, bytes) {
			if (err) console.log('err', err);
			client.close();
		});
	});
}

tryToReachAnotherUsers();

const rl = readline.createInterface({
	input: process.stdin,
	output: process.stdout,
	prompt: `${myName}> `
});

const chat = new Chat();
chat.start();

chat.on('message', (username, message, userIp) => {
	process.stdout.clearLine();
	process.stdout.cursorTo(0);
	console.log(`${userIp} ${username}> ${message}`);
	rl.prompt();
});

chat.on('left', username => {
	process.stdout.clearLine();
	process.stdout.cursorTo(0);
	console.log(`[${username} left the chat]`);
	rl.prompt();
});

rl.prompt();

rl.on('line', line => {
	chat.postMessage(line);
	rl.prompt();
}).on('close', () => {
	process.exit(0);
});
