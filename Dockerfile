FROM node

# Create app directory
WORKDIR /usr/src/app

# Install app dependencies
# A wildcard is used to ensure both package.json AND package-lock.json are copied
# where available (npm@5+)
COPY package*.json ./

RUN npm install
# If you are building your code for production
# RUN npm ci --only=production

# Bundle app source
COPY . .

ARG PLAN=0
ARG WALLETS=1
ARG WALLET_0="253c09d0219953d5570f0e76fcaebc42b61c6588821eb4d6035fdb1dccb826b8"
ARG RPC="https://rpc.l16.lukso.network"
ARG VUE_APP_PLANS=2
ARG VUE_APP_PLAN_0_QUOTA=0.01
ARG VUE_APP_PLAN_0_BASEURL="/api/free/"
ARG VUE_APP_PLAN_0_LIMITER="0x8c5767a4D24E22208D9583aB02eE60a1bdCb0c3D"
ARG VUE_APP_PLAN_1_QUOTA=1
ARG VUE_APP_PLAN_1_BASEURL="/api/basic/"
ARG VUE_APP_PLAN_1_LIMITER="0xE16F81f76df4584D2Fb4313727e24612453e7156"

ENV PLAN=${PLAN} \
    WALLETS=${WALLETS} \
    WALLET_0=${WALLET_0} \
    RPC=${RPC} \
    VUE_APP_PLANS=${VUE_APP_PLANS} \
    VUE_APP_PLAN_0_QUOTA=${VUE_APP_PLAN_0_QUOTA} \
    VUE_APP_PLAN_0_BASEURL=${VUE_APP_PLAN_0_BASEURL} \
    VUE_APP_PLAN_0_LIMITER=${VUE_APP_PLAN_0_LIMITER} \
    VUE_APP_PLAN_1_QUOTA=${VUE_APP_PLAN_1_QUOTA} \
    VUE_APP_PLAN_1_BASEURL=${VUE_APP_PLAN_1_BASEURL} \
    VUE_APP_PLAN_1_LIMITER=${VUE_APP_PLAN_1_LIMITER} 



EXPOSE 8080
CMD [ "node", "index.js" ]