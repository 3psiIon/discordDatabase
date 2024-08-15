function convertBase(str, fromBase, toBase) {
    const DIGITS = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz+/-\\=.,;:!?%&$#@*~_`\'"|[](){}<>^ ';
    const DIGITS_INDEX = {};
    for (let i = 0; i < DIGITS.length; i++) {
        DIGITS_INDEX[DIGITS[i]] = i;
    }
    let number = 0n;
    for (let i = 0; i < str.length; i++) {
        number = number * BigInt(fromBase) + BigInt(DIGITS_INDEX[str[i]]);
    }
    if (number === 0n) {
        return DIGITS[0].repeat(str.length);
    }
    let result = '';
    while (number > 0n) {
        result = DIGITS[Number(number % BigInt(toBase))] + result;
        number = number / BigInt(toBase);
    }
    let leadingZeros = 0;
    while (leadingZeros < str.length && DIGITS_INDEX[str[leadingZeros]] === 0) {
        leadingZeros++;
    }
    return DIGITS[0].repeat(leadingZeros) + result;
}

persistStore = {
    consts: {
        dbChannel: 'put database channel id here',
        dbEncChannel: 'put encrypted database channel id here',
        dbRootID: 'put database root message id here',
        dbEncRootID: 'put database root message id here'
    },
    msgLoaderCache: [
        [],
        {},
        []
    ],
    cache: {},
    protCache: {},
    queue: [],
    delQueue: [
        [], {}
    ],
    writeing: false,
    write: (x, enc) => {
        queue.push([x, enc])
    },
    key: ['put your keys', ' here (with bigint, read the instructions)'],
    encrypt: (data) => {
        data = Buffer.from(data)
        const iv = crypto.randomBytes(12);
        const cipher = crypto.createCipheriv('AES-256-GCM', Buffer.from((persistStore.key[0] ^ persistStore.key[1]).toString(16), 'hex'), iv);
        const encrypted = Buffer.concat([cipher.update(data), cipher.final()]);
        const tag = cipher.getAuthTag();
        return convertBase(Buffer.concat([iv, encrypted, tag]).toString('hex').toUpperCase(), 16, 95);
    },
    decrypt: (data) => {
        data = Buffer.from(convertBase(data, 95, 16), 'hex')
        const iv = data.subarray(0, 12);
        const tag = data.subarray(data.length - 16);
        const encrypted = data.subarray(12, data.length - 16);
        const decipher = crypto.createDecipheriv('aes-256-gcm', Buffer.from((persistStore.key[0] ^ persistStore.key[1]).toString(16), 'hex'), iv);
        decipher.setAuthTag(tag);
        return Buffer.concat([decipher.update(encrypted), decipher.final()]).toString();
    },
    loaded: false
}
async function loadDB(root, enc) {
    var msgCache = persistStore.msgLoaderCache[1]
    for (let i in root) {
        if (root[i] === null) {
            delete root[i]
            continue
        }
        root[i] = msgCache[root[i]]
        persistStore.msgLoaderCache[2].push(root[i])
        root[i] = root[i].content.length > 0 ? root[i].content.slice(3, -3) : Buffer.from(await (await fetch(root[i].attachments.first().url)).arrayBuffer()).toString()
        if (enc) {
            root[i] = persistStore.decrypt(root[i])
        }
        switch (root[i][0]) {
            case 'o':
                root[i] = JSON.parse(root[i].slice(1))
                await loadDB(root[i], enc)
                break
            case 's':
                root[i] = root[i].slice(1)
                break
            case 'N':
                root[i] = Number(root[i].slice(1))
                break
            case 'B':
                root[i] = root[i][1] === 't' ? true : false
                break
            case '0':
                root[i] = root[i][1] === 'n' ? null : undefined
                break
            case 'n':
                root[i] = BigInt(root[i].slice(1))
                break
            case 'b':
                root[i] = Buffer.from(root[i].slice(1), 'hex')
                break
            case 'f':
                eval('root[i] = ' + root[i].slice(1))
                break
        }
    }
}
persistStore.write = async (x, enc) => {
    var path = enc ? persistStore.protCache : persistStore.cache
    for (let i = 0; i < x[1].length - 1; i++) {
        path = path[x[1][i]]
    }
    path[x[1][x[1].length - 1]] = x[0]
    persistStore.queue.push([x, enc])
}
persistStore.update = async (x, enc) => {
    persistStore.writeing = true
    var msgID = enc ? persistStore.consts.dbEncRootID : persistStore.consts.dbRootID
    var pathIDs = [msgID]
    var msg = persistStore.msgLoaderCache[1][msgID]
    var root = msg.content.slice(3, -3)
    if (enc) {
        root = persistStore.decrypt(root)
    }
    root = JSON.parse(root)
    for (let i = 0; i < x[1].length - 1; i++) {
        msgID = root[x[1][i]]
        pathIDs.push(msgID)
        msg = persistStore.msgLoaderCache[1][msgID]
        root = msg.content.length > 0 ? msg.content.slice(3, -3) : Buffer.from(await (await fetch(msg.attachments.first().url)).arrayBuffer()).toString()
        if (enc) {
            root = persistStore.decrypt(root)
        }
        root = root.slice(1)
        root = JSON.parse(root)
    }
    var send
    switch (typeof x[0]) {
        case 'string':
            send = 's' + x[0]
            break
        case 'number':
            send = 'N' + x[0].toString()
            break
        case 'object':
            if (x[0] === null) {
                send = '0null'
            } else if (Buffer.isBuffer(x[0])) {
                send = 'b' + x[0].toString('hex')
            } else {
                send = Array.isArray(x[0]) ? 'o[]' : 'o{}'
                for (let i in x[0]) {
                    let path = structuredClone(x[1])
                    path.push(i)
                    persistStore.queue.push([
                        [x[0][i], path], enc
                    ])
                }
            }
            break
        case 'boolean':
            send = 'B' + x[0].toString()
            break
        case 'undefined':
            send = '0undefined'
            break
        case 'bigint':
            send = 'n' + x[0].toString()
            break
        case 'function':
            send = 'f' + x[0].toString()
            break
        default:
            panel.error(`Unsupported Datatype Write Attempt: ${x[0]} (${typeof x[0]})`)
            return
    }
    if (enc) {
        send = persistStore.encrypt(send)
    }
    if (send.length > 1994) {
        send = {
            files: [new AttachmentBuilder(Buffer.from(send), {
                name: 'message.txt'
            })]
        }
    } else {
        send = '```' + send + '```'
    }
    if (root[x[1][x[1].length - 1]] && typeof send === 'string') {
        if (persistStore.msgLoaderCache[1][root[x[1][x[1].length - 1]]].content !== send) {
            (persistStore.msgLoaderCache[1][root[x[1][x[1].length - 1]]]).edit(send)
        }
    } else {
        var newMsg = (await msg.reply(send))
        persistStore.msgLoaderCache[0].push(newMsg)
        persistStore.msgLoaderCache[1][newMsg.id] = newMsg
        persistStore.msgLoaderCache[2].push(newMsg)
        for (let i = pathIDs.length - 1; i >= 0; i--) {
            let parsedMsg = persistStore.msgLoaderCache[1][pathIDs[i]].content.length > 0 ? persistStore.msgLoaderCache[1][pathIDs[i]].content.slice(3, -3) : Buffer.from(await (await fetch(persistStore.msgLoaderCache[1][pathIDs[i]].attachments.first().url)).arrayBuffer()).toString()
            if (enc) {
                parsedMsg = persistStore.decrypt(parsedMsg)
            }
            parsedMsg = parsedMsg.slice(pathIDs[i] === persistStore.consts.dbRootID || pathIDs[i] === persistStore.consts.dbEncRootID ? 0 : 1)
            parsedMsg = JSON.parse(parsedMsg)
            parsedMsg[x[1][i]] = newMsg.id
            parsedMsg = JSON.stringify(parsedMsg)
            let newText = (persistStore.msgLoaderCache[1][pathIDs[i]].id === persistStore.consts.dbRootID || persistStore.msgLoaderCache[1][pathIDs[i]].id === persistStore.consts.dbEncRootID ? '' : 'o') + parsedMsg
            if (enc) {
                newText = persistStore.encrypt(newText)
            }
            if (newText.length <= 1994) {
                await persistStore.msgLoaderCache[1][pathIDs[i]].edit('```' + newText + '```')
                break
            } else if (0 !== i) {
                newMsg = await persistStore.msgLoaderCache[1][pathIDs[i - 1]].reply({
                    files: [new AttachmentBuilder(Buffer.from(newText), {
                        name: 'message.txt'
                    })]
                })
                persistStore.msgLoaderCache[0].push(newMsg)
                persistStore.msgLoaderCache[1][newMsg.id] = newMsg
            } else {
                panel.error('Attempted write to db' + enc ? 'Enc' : '' + 'Root failed: Out of Storage (msgID: ' + pathIDs[1] + ')')
                break
            }
        }
    }
    persistStore.writeing = false
}
persistStore.updater = async function() {
    while (true) {
        if (persistStore.queue[0] && !persistStore.writeing) {
            let temp = persistStore.queue.splice(0, 1)[0]
            await persistStore.update(temp[0], temp[1])
        }
        await panel.funcs.sleep(300)
    }
}
persistStore.deleter = async function() {
    var key = crypto.randomBytes(64).toString('hex') + Date.now()
    var temp1 = persistStore.delQueue[0].filter(x => {
        for (let z in persistStore.delQueue[1]) {
            if (persistStore.delQueue[1][z].includes(x.id)) {
                return false
            }
        }
        return true
    })
    persistStore.delQueue[0][key] = temp1.map(x => x.id)
    persistStore.delQueue[0] = []
    temp1 = [temp1.filter(x => Date.now() - x.createdTimestamp < 1209000000), temp1.filter(x => Date.now() - x.createdTimestamp >= 1209000000)]
    var temp2 = {}
    for (let i = 0; i < temp1[0].length; i++) {
        if (!temp2[temp1[0][i].channelId]) {
            temp2[temp1[0][i].channelId] = []
        }
        temp2[temp1[0][i].channelId].push(temp1[0][i])
    }
    for (let i in temp2) {
        while (temp2[i].length > 0) {
            await client.channels.cache.get(i).bulkDelete(temp2[i].splice(0, 100))
        }
    }
    for (let i = 0; i < temp1[1].length; i++) {
        try {
            await temp1[1][i].delete()
        } catch {}
    }
    delete persistStore.delQueue[0][key]
}
client.once("ready", async () => {
    persistStore.consts.dbChannel = client.channels.cache.get(persistStore.consts.dbChannel)
    persistStore.consts.dbEncChannel = client.channels.cache.get(persistStore.consts.dbEncChannel)
    var msgFetchArgs = {
        limit: 100
    }
    while (true) {
        let temp = await persistStore.consts.dbChannel.messages.fetch(msgFetchArgs)
        temp.forEach(i => persistStore.msgLoaderCache[0].push(i))
        if (temp.size === 0) {
            break
        }
        msgFetchArgs.before = persistStore.msgLoaderCache[0][persistStore.msgLoaderCache[0].length - 1].id
    }
    delete msgFetchArgs.before
    while (true) {
        let temp = await persistStore.consts.dbEncChannel.messages.fetch(msgFetchArgs)
        temp.forEach(i => persistStore.msgLoaderCache[0].push(i))
        if (temp.size === 0) {
            break
        }
        msgFetchArgs.before = persistStore.msgLoaderCache[0][persistStore.msgLoaderCache[0].length - 1].id
    }
    for (let i = 0; i < persistStore.msgLoaderCache[0].length; i++) {
        persistStore.msgLoaderCache[1][persistStore.msgLoaderCache[0][i].id] = persistStore.msgLoaderCache[0][i]
    }
    persistStore.msgLoaderCache[2].push(persistStore.msgLoaderCache[1][persistStore.consts.dbRootID], persistStore.msgLoaderCache[1][persistStore.consts.dbEncRootID])
    persistStore.cache = JSON.parse((await persistStore.consts.dbChannel.messages.fetch(persistStore.consts.dbRootID)).content.slice(3, -3))
    await loadDB(persistStore.cache)
    persistStore.protCache = JSON.parse(persistStore.decrypt((await persistStore.consts.dbEncChannel.messages.fetch(persistStore.consts.dbEncRootID)).content.slice(3, -3)))
    await loadDB(persistStore.protCache, true)
    var temp = persistStore.msgLoaderCache[2].map(x => x.id)
    for (let i = 0; i < persistStore.msgLoaderCache[0].length; i++) {
        if (!temp.includes(persistStore.msgLoaderCache[0][i].id)) {
            persistStore.delQueue[0].push(persistStore.msgLoaderCache[0][i])
        }
    }
    temp = undefined
    while (persistStore.queue.length > 0) {
        let temp = persistStore.queue.splice(0, 1)[0]
        await persistStore.update(temp[0], temp[1])
        await panel.sleep(300)
    }
    persistStore.updater()
    persistStore.deleter()
    persistStore.loaded = true
});
