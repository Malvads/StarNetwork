const WebSocket = require('ws')
const Express = require('express')
const fs = require('fs')
const satanizeHTML = require('sanitize-html')
const App = Express()

process.on('uncaughtException', err => {})

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
    static parseIncomingMessage(view, offset){
        let data = ProtoParser.readString(view, offset)
        const name = data.res
        offset = data.offset
        data = ProtoParser.readString(view, offset)
        const message = data.res
        offset = data.offset
        return {name, message}
    }
    static repackAndPreventXSS(msg){
        let data = ProtoParser.parseIncomingMessage(new DataView(new Uint8Array(msg).buffer), 1)
        data.name = satanizeHTML(data.name)
        data.message = satanizeHTML(data.message)
        let packet = [0]
        packet = ProtoParser.writeString(packet, data.name)
        packet = ProtoParser.writeString(packet, data.message)
        return new Uint8Array(packet)
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
        this.sockets = []
        this.server = null
        this.init()
    }
    init(){
        this.server = new WebSocket.Server({
            port: this.port
        })
        this.server.on('connection', socket => {
            socket.id = Math.floor(Math.random() * 999999)
            this.sockets.push(socket)
            socket.on('message', msg => {
                const id = socket.id
                console.log(`Got New Message From: ${socket._socket.remoteAddress}, HexDump [${HexDumper.ArrayToHexDump(msg)}]`)
                msg = ProtoParser.repackAndPreventXSS(msg)
                for(let i = 0; i < this.sockets.length; i++){
                    if(this.sockets[i].id != id && this.sockets[i]._socket.remoteAddress != undefined){
                        this.sockets[i].send(msg)
                        console.log(`Server Sended Message to : ${this.sockets[i]._socket.remoteAddress}, HexDump [${HexDumper.ArrayToHexDump(msg)}]`)
                    }
                }
            })
            socket.on('close', function(){
                for(let i = 0; i < this.sockets.length; i++){
                    if(socket.id == this.sockets[i].id) this.sockets.splice(i, 1)
                }
            })
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
