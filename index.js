/**
 * A simple proxy to create an API conforming to the Transaction Relay Service API Standards (https://lukso.notion.site/lukso/Transaction-Relay-Service-API-Standard-2bda58f4f47f4497bb3381654acda8c3)
 */

 require('dotenv').config({path: ".env.local"});
 const cors = require('cors')
 const http = require('http')
 const express = require('express')
 const app = express()
 const stripe = require('stripe')(process.env.STRIPE);
 const endpointSecret = process.env.ENDPOINT_SECRET
 
 const { providers, ethers, BigNumber } = require("ethers");
 const provider = new providers.JsonRpcProvider("https://rpc.l16.lukso.network");
 const limiter = process.env["LIMITER"]
 const { Runner, Tester } = require("./runner");
 const { nextTick } = require('process');
 const { response } = require('express');
 
 
 
 const plans = [];
 
 for(let i = 0; i < Number(process.env["VUE_APP_PLANS"]); i++){
   plans.push({
     name: process.env[`VUE_APP_PLAN_${i}_NAME`],
     quota: process.env[`VUE_APP_PLAN_${i}_QUOTA`],
     limiter: process.env[`VUE_APP_PLAN_${i}_LIMITER`],
     baseURL: process.env[`VUE_APP_PLAN_${i}_BASEURL`],
   })
 }
 
 const wallets = [];
 
 for(let j = 0; j < Number(process.env["WALLETS"]); j++){
   wallets.push(process.env[`WALLET_${j}`])
 }
 
 console.log(process.env)
 
 const port = process.env['PORT'] || 8080
 let plan = plans[Number(process.env['PLAN'])]
 let owner = process.env['OWNER']
 let runner = new Runner(plan.limiter, wallets, owner, process.env["RPC"], Number(process.env['VUE_APP_CHAIN']))
 
 // Endpoint stripe will call when a new user has subscribed. Add them to the contract
 app.post("/webhook", express.raw({type: 'application/json'}), async(req, res) => {
   const sig = req.headers['stripe-signature'];
 
   let event;
 
   try {
     event = stripe.webhooks.constructEvent(req.body, sig, endpointSecret);
   } catch (err) {
     res.status(400).send(`Webhook Error: ${err.message}`);
     return;
   }
 
   try{
     switch (event.type) {
       case 'checkout.session.completed':
         const session = event.data.object;
         const client_reference_id = session.client_reference_id
         stripe.subscriptions.update(
           session.subscription,
           {metadata: {client_reference_id: client_reference_id}}
         ).then(() => {
           runner.addUser(client_reference_id).then(() => {
               res.sendStatus(200)
           })    
         })
         // Then define and call a function to handle the event checkout.session.completed
         break;
       case 'customer.subscription.deleted':
         const subscription = event.data.object;
         runner.removeUser(subscription.metadata.client_reference_id).then(() => {
           res.sendStatus(200)
         })
         // Then define and call a function to handle the event customer.subscription.deleted
         break;
       // ... handle other event types
       default:
         console.log(`Unhandled event type ${event.type}`);
     }    
   }
   catch(err){
     nextTick(err)
   }
 
 
 })
 
 
 
 // was causing stripe errors
 app.use(express.json());       // to support JSON-encoded bodies
 app.use(cors())
 
 app.post(plan.baseURL + 'create-customer-portal-session', async (req, res) => {
   try{
     const subscriptions = await stripe.subscriptions.search({
       query: `status:"active" AND metadata["client_reference_id"]:"${req.body.address}"`,
     });
     const subscription = await stripe.subscriptions.retrieve(subscriptions.data[0].id); 
     const session = await stripe.billingPortal.sessions.create({
       customer: subscription.customer,
       return_url: req.body.redirect_url,
     });    
     res.send(JSON.stringify({
       url: session.url
     }))
   }
   catch(err){
     nextTick(err)
   }
 });
 
 /**
  * TODO: POST /execute
  * Request
  ** {
  **      "address": "0xBB645D97B0c7D101ca0d73131e521fe89B463BFD", // Address of the UP
  **      "transaction": {
  **          "abi": "0x7f23690c5ef83ad9559033e6e941db7d7c495acdce616347d28e90c7ce47cbfcfcad3bc5000000000000000000000000000000000000000000000000000000000000004000000000000000000000000000000000000000000000000000000000000000596f357c6aa5a21984a83b7eef4cb0720ac1fcf5a45e9d84c653d97b71bbe89b7a728c386a697066733a2f2f516d624b43744b4d7573376741524470617744687a32506a4e36616f64346b69794e436851726d3451437858454b00000000000000",
  **          "signature": "0x43c958b1729586749169599d7e776f18afc6223c7da21107161477d291d497973b4fc50a724b1b2ab98f3f8cf1d5cdbbbdf3512e4fbfbdc39732229a15beb14a1b",
  **          "nonce": 1 // KeyManager nonce
  **      },
  ** }
  * Response
  ** {
  **      "transactionHash": "0xBB645D97B0c7D101ca0d73131e521fe89B463BFD",
  ** }
  * 
  * Submit the transaction to the database
  */
 
 app.post(plan.baseURL + 'execute', async(req, res) => {
   
   try{
     let hash = await runner.sendTransaction(req.body['address'], req.body.transaction['abi'], req.body.transaction['signature'], BigNumber.from(req.body.transaction['nonce']))
     console.log(hash)
     res.send(JSON.stringify({
       transactionHash: hash
     }))
   }  
   catch(err) {
     nextTick(err)
   }
 })
 
 /**
  * TODO: POST /quota
  * Request
  ** {
  **      "address": "0xBB645D97B0c7D101ca0d73131e521fe89B463BFD",
  **      "timestamp": 1656408193,
  **      "signature": "0xf480c87a352d42e49112257cc6afab0ff8365bb769424bb42e79e78cd11debf24fd5665b03407d8c2ce994cf5d718031a51a657d4308f146740e17e15b9747ef1b"
  ** }
  * Response
  ** {
  **      "quota": 1_543_091 // You have YYY left
  **      "unit": "gas" // could be "lyx", "transactionCount"
  **      "totalQuota": 5_000_000 total gas for the month
  **      "resetDate": 1656408193
  ** }
  * Retrieve the quota information from the contract
  */
 app.post(plan.baseURL + 'quota', async (req, res) => {
     try {
       let data = await runner.getQuota(req.body['address'])
       res.send(JSON.stringify({
           quota: data.quota,
           unit: data.unit,
           totalQuota: plan.quota,
           resetDate: data.resetDate,
       }))
     }
     catch(err) {
       nextTick(err)
     }
 })
 
 app.get("/", async(req,res) => {
   res.send("🤓")
 })
 
 console.log(`Listening on port ${port}`)
 console.log(`BaseURL: ${plan.baseURL}`)
 http.createServer(app).listen(port)