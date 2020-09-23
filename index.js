const WebSocket = require('ws')
const Express = require('express')
const fs = require('fs')
const satanizeHTML = require('sanitize-html')
const { uuid } = require('uuidv4')
const App = Express()

class ProtoParser {
    static writeString(packet, string){
        for(let i = 0; i < string.length; i++) packet.push(string.charCodeAt(i))
        packet.push(0)
        return packet
    }
    static readString(view, offset){
        let res = ''
        while(true){
            const char = view.getUint8(offset++)
            if(char == 0) break
            res += String.fromCharCode(char)
        }
        return {res, offset}
    }
    static parseIncomingMessage(view, offset, isPrivate){
        if(!isPrivate){
            let data = ProtoParser.readString(view, offset)
            const name = data.res
            offset = data.offset
            data = ProtoParser.readString(view, offset)
            const message = data.res
            offset = data.offset
            return {name, message}
        } else {
            let data = ProtoParser.readString(view, offset)
            const name = data.res
            offset = data.offset
            data = ProtoParser.readString(view, offset)
            const message = data.res
            offset = data.offset
            data = ProtoParser.readString(view, offset)
            const socketTarget = data.res
            offset = data.offset
            return {name, message, socketTarget}
        }
    }
    static repackAndPreventXSS(msg, senderId, isPrivate){
        let data = ProtoParser.parseIncomingMessage(new DataView(new Uint8Array(msg).buffer), 1, isPrivate)
        data.name = satanizeHTML(data.name)
        data.message = satanizeHTML(data.message)
        let packet = [0]
        packet = ProtoParser.writeString(packet, data.name)
        packet = ProtoParser.writeString(packet, data.message)
        packet = ProtoParser.writeString(packet, senderId)
        if(!isPrivate){
            return new Uint8Array(packet)
        } else {
            packet[0] = 1
            return {
                packet: new Uint8Array(packet),
                targetSocket: data.socketTarget
            }
        }
    }
}

class HexDumper {
    static ArrayToHexDump(msg){
        msg = new Uint8Array(msg)
        let res = ''
        for(let i = 0; i < msg.length; i++){
            res += msg[i].toString(16)
            res += ' '
        }
        return res
    }
}

class ChatServer {
    constructor(port){
        this.port = port
        this.sockets = {}
        this.server = null
        this.init()
    }
    init(){
        this.server = new WebSocket.Server({
            port: this.port
        })
        this.server.on('connection', socket => {
            const userId = uuid()
            socket.userid = userId
            this.sockets[socket.userid] = socket
            socket.on('message', msg => {
                switch(msg[0]){
                    case 0:
                        const _id = socket.userid
                        console.log(`Got New Message From: ${socket._socket.remoteAddress}, HexDump [${HexDumper.ArrayToHexDump(msg)}]`)
                        msg = ProtoParser.repackAndPreventXSS(msg, _id.toString())
                        for(let id in this.sockets){
                            if(this.sockets[id].userid != _id && this.sockets[id]._socket.remoteAddress != undefined){
                                this.sockets[id].send(msg)
                                console.log(`Server Sended Message to : ${this.sockets[id]._socket.remoteAddress}, HexDump [${HexDumper.ArrayToHexDump(msg)}]`)
                            }
                        }
                        break
                    case 1:
                        console.log(`Got New Message From: ${socket._socket.remoteAddress}, HexDump [${HexDumper.ArrayToHexDump(msg)}]`)
                        msg = ProtoParser.repackAndPreventXSS(msg, socket.userid.toString(), 1) // 1 means private Message, so send only to 1 socket
                        const targetSocket = msg.targetSocket
                        const messageBytes = msg.packet
                        if(this.sockets[targetSocket]){
                            this.sockets[targetSocket].send(messageBytes)
                            console.log(`Socket with id: ${socket.userid} and ip ${socket._socket.remoteAddress} Asked to Send Packet[${HexDumper.ArrayToHexDump(messageBytes)}] to Socket ${this.sockets[targetSocket]._socket.remoteAddress} with Id: ${targetSocket} Server will try to broadcast the message.`)
                        }
                        break
                }
            })
            socket.on('close', function(){
                delete this.sockets[userId] 
            }.bind(this))
        })
    }
}

const chat = new ChatServer(8081)

App.listen(8080, () => {
    const net = JSON.stringify(require('os').networkInterfaces())
    console.log('WebApp Add -> ' + 'http://' + net.match(/192.168.\d+.\d+/)[0] + ':8080/index')
    console.log('WebSocketServer -> ' + 'ws://' + net.match(/192.168.\d+.\d+/)[0] + ':8081')
})

App.get('/client.js', (req, res) => {
    const js = fs.readFileSync('./html/client.js').toString()
    res.set('Content-Type', 'text/plain')
    res.send(js)
})

App.get('/index', (req, res) => {
    const html = fs.readFileSync('./html/index.html').toString()
    res.set('Content-Type', 'text/html')
    res.send(html)
})
