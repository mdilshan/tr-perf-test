require('dotenv').config()
const amqp = require('amqplib')
const EventEmitter = require('events');
const { performance } = require('perf_hooks');

const url = process.env.SHOP_RMQ_URL
const queue = process.env.SHOP_RMQ_QUEUE
const wowQueue = process.env.WOW_RMQ_QUEUE

const REPLY_QUEUE = 'amq.rabbitmq.reply-to';

const createClient = rabbitmqconn =>
    amqp
        .connect(rabbitmqconn)
        .then(conn => conn.createChannel())
        .then(channel => {
            channel.responseEmitter = new EventEmitter();
            channel.responseEmitter.setMaxListeners(0);
            channel.consume(
                REPLY_QUEUE,
                msg => {
                    channel.responseEmitter.emit(
                        msg.properties.correlationId,
                        msg.content.toString('utf8'),
                    );
                },
                { noAck: true },
            );
            return channel;
        });

const sendRPCMessage = (channel, pattern, message, rpcQueue) =>
    new Promise(resolve => {
        const correlationId = Date.now().toString();
        channel.responseEmitter.once(correlationId, resolve);

        const msg = {
            pattern: pattern,
            data: message,
            id: correlationId,
        }

        channel.sendToQueue(rpcQueue, Buffer.from(JSON.stringify(msg)), {
            correlationId,
            replyTo: REPLY_QUEUE,
        });
    });

let perf1 = []
let perf2 = []
let perf3 = []
let perf4 = []

async function main() {
    console.log("Running the test...")
    for (let i = 0; i < 10; i++) {
        const s0 = performance.now()
        const channel = await createClient(url)
        const e0 = performance.now()
        perf1.push(e0 - s0)

        const exigoId = 19445;
        const s1 = performance.now()
        const response2 = await getUserData(channel, exigoId)
        const s2 = performance.now()
        perf2.push(s2 - s1)

        const s3 = performance.now()
        const response4 = await isUserSubscribed(channel, exigoId)
        const s4 = performance.now()
        // console.log(response4)
        perf3.push(s4 - s3)

        const s5 = performance.now()
        const response5 = await getStaticToken(channel, exigoId)
        const s6 = performance.now()
        // console.log(response5)
        perf4.push(s6 - s5)
    }


    const avarage = arr => arr.reduce((a, b) => a + b) / arr.length

    console.log("Avarage time to connect to RMQ:", Math.round(avarage(perf1)) / 1000, "sec")
    console.log("Avarage time to get user details:", Math.round(avarage(perf2)) / 1000, "sec")
    console.log("Avarage time to get user subscription:", Math.round(avarage(perf3)) / 1000, "sec")
    console.log("Avarage time to get static token:", Math.round(avarage(perf4)) / 1000, "sec")

    process.exit(0)
}


/**
    * @param {ampq.Channel} channel
    * @param {number} exigoId
*/
function getUserData(channel, exigoId) {
    return sendRPCMessage(channel, 'get-customer-data', { userId: exigoId }, queue)
}

function isUserSubscribed(channel, exigoId) {
    return sendRPCMessage(channel, 'assert-customer-subscriptions-active', { customerId: exigoId }, wowQueue)
}

function getStaticToken(channel, exigoId) {
    return sendRPCMessage(channel, 'generate-triva-sso-token', { customerId: exigoId }, wowQueue)
}

main()
