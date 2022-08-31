# Runner
A simple transaction runner for Gasless Relayer Saas. It executes relay transactions as well as fetching a users' quota from the contract. 

This is built to be very simple yet versatile. Each runner only serves a particular plan, and can have one or more wallets to choose from. 

At the very least, you would want to have a runner for the Free plan users and one for the Basic plan users. They should have at least one unique wallet each. This ensures that users from different plans don't negatively impact each other

To scale, you could do a number of things depending on what the bottleneck is. If there are too many transactions and confirmation time/nonces become an issue, you can add more wallets for the runner to cycle through. If there is too much traffic hitting the runner and causing it to crash, you can add more runners and put a load balancer in front. 

## [Demo (Free)](http://pupcakes.me:8083)
## [Demo (Basic)](http://pupcakes.me:8084)

## Development setup
Modify the variables in the .env file as necessary and rename it to .env.local

```
npm install
```

### Start the express server
```
node index.js
```

## Docker

**Do not push the docker image to a public location like dockerhub to avoid leaking enviornment variables**
### Build

```
docker build . -t gasless/app
```
### Run
```
docker run -p 8083:8080 -d --name app gasless/app
```
