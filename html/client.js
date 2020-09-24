class ChatController {
    static addMessageSendedByMe(message, isPrivate, tSocket){
        message = DOMPurify.sanitize(message, {ALLOWED_TAGS: []})
        if(isPrivate){
            tSocket = DOMPurify.sanitize(tSocket, {ALLOWED_TAGS: []})
        }
        let HTML = ''
        if(!isPrivate){
            HTML = `Me`
        } else {
            HTML = `Me sended private message to: ${tSocket}`
        }
        document.getElementById('chat').innerHTML += `<div class="alert alert-success" role="alert">
            <b>${HTML}</b> - ${message}
        </div>`        
    }
    static addMessageSendedByOther(message){
        message.sender = DOMPurify.sanitize(message.sender, {ALLOWED_TAGS: []})
        message.content = DOMPurify.sanitize(message.content, {ALLOWED_TAGS: []})
        message.socketId = DOMPurify.sanitize(message.socketId, {ALLOWED_TAGS: []})
        document.getElementById('chat').innerHTML += `<div class="alert alert-dark" role="alert">
            <b>${message.sender} - socketId: ${message.socketId}</b> - ${message.content}
        </div>` 
    }
    static addMessageSendedByUniquesocket(message){
        message.sender = DOMPurify.sanitize(message.sender, {ALLOWED_TAGS: []})
        message.content = DOMPurify.sanitize(message.content, {ALLOWED_TAGS: []})
        message.socketId = DOMPurify.sanitize(message.socketId, {ALLOWED_TAGS: []})
        document.getElementById('chat').innerHTML += `<div class="alert alert-warning" role="alert">
            <b>${message.sender} - Private message from socketId: ${message.socketId}</b> - ${message.content}
        </div>` 
    }
}

class Dumper {
    static ArrayToHexIncomingDump(packet){
        let res = ''
        for(let i = 0; i < packet.length; i++){
            res += packet[i].toString(16)
            res += ' '
        }
        document.getElementById('incoming').innerHTML += `<div class="alert alert-info" role="alert">
            ${res}
        </div>`
    }
    static ArrayToHexOutgoingDump(packet){
        let res = ''
        for(let i = 0; i < packet.length; i++){
            res += packet[i].toString(16)
            res += ' '
        }
        document.getElementById('outgoing').innerHTML += `<div class="alert alert-info" role="alert">
            ${res}
        </div>`
    }
}

class ProtoParser {
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
        let data = ProtoParser.readString(view, offset)
        const name = data.res
        offset = data.offset
        data = ProtoParser.readString(view, offset)
        const message = data.res
        offset = data.offset
        data = ProtoParser.readString(view, offset)
        const socketId = data.res
        offset = data.offset
        console.log(socketId)
        Dumper.ArrayToHexIncomingDump(new Uint8Array(view.buffer))
        
        if(!isPrivate){
            ChatController.addMessageSendedByOther({
                sender:name,
                content: message,
                socketId: socketId
            })
        } else {
            ChatController.addMessageSendedByUniquesocket({
                sender:name,
                content: message,
                socketId: socketId
            })
        }
    }
}

class ProtoSender {
    static sendNewChatMessage(isPrivate){
        if(!isPrivate){
            const packet = []
            packet.push(0)
            const nickname = document.getElementById('name').value
            const message = document.getElementById('message').value
            for(let i = 0; i < nickname.length; i++) packet.push(nickname.charCodeAt(i))
            packet.push(0)
            for(let i = 0; i < message.length; i++) packet.push(message.charCodeAt(i))
            packet.push(0)
            Dumper.ArrayToHexOutgoingDump(packet)
            ChatController.addMessageSendedByMe(document.getElementById('message').value)
            window.client.doSafeSend(new Uint8Array(packet))
        } else {
            const packet = []
            packet.push(1)
            const nickname = document.getElementById('name').value
            const message = document.getElementById('message').value
            const targetSocket = document.getElementById('socketid').value
            for(let i = 0; i < nickname.length; i++) packet.push(nickname.charCodeAt(i))
            packet.push(0)
            for(let i = 0; i < message.length; i++) packet.push(message.charCodeAt(i))
            packet.push(0)
            for(let i = 0; i < targetSocket.length; i++) packet.push(targetSocket.charCodeAt(i))
            packet.push(0)
            Dumper.ArrayToHexOutgoingDump(packet)
            ChatController.addMessageSendedByMe(document.getElementById('message').value, true, targetSocket)
            window.client.doSafeSend(new Uint8Array(packet))
        }
    }
}

class Client {
    constructor(port){
        this.port = port
        this.targetURL = `ws://${document.URL.match(/http:\/\/(.+):.+/)[1]}:${this.port}`
        this.server = null
        this.reconnectDelayMS = 5000
        this.doConfig()
    }
    doSafeSend(packet){
        if(this.server.readyState == WebSocket.OPEN){
            this.server.send(packet)
        }
    }
    doConfig(){
        this.server = new WebSocket(this.targetURL)
        this.server.binaryType = 'arraybuffer'
        this.server.onopen = this.onopen.bind(this)
        this.server.onmessage = this.onmessage.bind(this)
        this.server.onerror = this.onerror.bind(this)
        this.server.onclose = this.onclose.bind(this)
    }
    onopen(){
        console.log('[*] WebSocket Opened.')
    }
    onmessage(m){
        const message = new DataView(m.data)
        let offset = 0
        const OpCode = message.getUint8(offset++)
        switch(OpCode){
            case 0:
                ProtoParser.parseIncomingMessage(message, offset)
                break
            case 1:
                ProtoParser.parseIncomingMessage(message, offset, true)
                break;
        }
    }
    onerror(){
        this.onclose()
    }
    onclose(){
        if(this.server.readyState == WebSocket.CLOSED || this.server.readyState == WebSocket.CLOSING){
            setTimeout(function(){
                this.doConfig()
            }.bind(this), this.reconnectDelayMS)
        }
    }
}

function check(){
    if(document.readyState === 'complete'){
        init()
        console.log('DOM ready')
    } else {
        setTimeout(function(){
            check()
        }, 1e3)
    }
}

check()

function init(){
    window.client = new Client(8081)
    document.getElementById('sendmessage').onclick = function(){
        ProtoSender.sendNewChatMessage()
    }
    document.getElementById('sendmessageprivate').onclick = function(){
        ProtoSender.sendNewChatMessage(true)
    }
}
