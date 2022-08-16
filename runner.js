const { Contract, Wallet, BigNumber, ethers, providers } = require("ethers")
const multicall = require('ethers-multicall');
multicall.setMulticallAddress(2828, "0xa7c07884442c407a1d97ef86c0c305a1a45a264b")
const UniversalProfileContract = require('@lukso/lsp-smart-contracts/artifacts/UniversalProfile.json');
const KeyManagerContract = require('@lukso/lsp-smart-contracts/artifacts/LSP6KeyManager.json');

/**
 *TODO Relay runner
 ** A bot to take call data and send a transaction
 *
 * So there's couple of things to keep in mind here.
 * In the case of free users, we won't bother scaling. We'll only run one bot with one wallet. 
 * For paid users, we'll want multiple wallets running
 * These can share the same code base, but there will be two instances running
 * 
 */

class Runner {
    /**
     * A transaction runner
     * @param {String} limiter The limiter address 
     * @param {Array<String>} wallets The keys of the wallets to send transactions with
     * @param {String} rpc The RPC to use
     * @param {Number} chain The Chain ID
     * @param {Boolean} performance Toggle performance logging
     * @param {Boolean} logging Toggle general logging
     */
    constructor(limiter, wallets, owner, rpc, chain, performance=true, logging=true){
        this.provider = new providers.JsonRpcProvider({ url: rpc}, chain) 
        this.ethcallProvider = new multicall.Provider(this.provider, chain)
        this.limiter = new ethers.Contract(limiter, require("./ABI/GasLimiter.json"), this.provider)
        this.wallets = wallets.map(wallet => { return  {wallet: new ethers.Wallet(wallet, this.provider), priority: 0, balance: 0} })
        this.owner = new ethers.Wallet(owner, this.provider)
        this.performance = performance
        this.logging = logging
    }
    /**
     * 
     * @param {String} address The address to retrieve the quota of 
     * @returns {{quota: string, unit: string, resetDate: string}} The amount of quota used, the unit, and the resetDate
     */
    async getQuota(address){
        let contract = new multicall.Contract(this.limiter.address, require("./ABI/GasLimiter.json"))
        let promises = [contract.quota(address), contract.nextPeriod(address)]
        let data = await this.ethcallProvider.all(promises)
        return {
            quota: ethers.utils.formatEther(data[0].gas),
            unit: "LYXe",
            resetDate: data[1].toString(),
        }
    }
    /**
     * Choose a wallet with sufficient balances, sorted by last use
     * @param {BigNumber} cost The transaction fee cost
     * @returns {{wallet: Wallet, priority: Number, balance: BigNumber}} a wallet
     */
    async selectWallet(cost){
        let promises = this.wallets.map(x => this.ethcallProvider.getEthBalance(x.wallet.address))
        let balances = await this.ethcallProvider.all(promises)
        balances.map((balance, i) => this.wallets[i].balance = balance)
        let selection = this.wallets.filter(wallet => wallet.balance.gt(cost))
        selection = selection.sort((a, b) => (a.priority > b.priority) ? 1 : -1).reverse()
        return selection[0]
    }
    /**
     * Executes a signed transaction on behalf of a UP using executeRelayCall()
     * @param {String} address Address of the UP
     * @param {String} abi Data of the transacation
     * @param {String} signature Signature of controller
     * @param {Number} nonce The nonce of the controller
     * @returns 
     */
    async sendTransaction(address, abi, signature, nonce){
        let universalProfile = new ethers.Contract(address, UniversalProfileContract.abi, this.provider)
        let keyManager = await universalProfile.owner()
        keyManager = new ethers.Contract(keyManager, KeyManagerContract.abi, this.provider)
        let tx = await this.limiter.populateTransaction.execute(universalProfile.address, signature, nonce, abi, {from: this.wallets[0].wallet.address})//await keyManager.populateTransaction.executeRelayCall(signature, nonce, abi)
        let gas = await this.wallets[0].wallet.estimateGas(tx)
        let wallet = (await this.selectWallet(gas)).wallet
        let recipt = await wallet.sendTransaction(tx)
        return recipt.hash
    }
    async addUser(address){
        let tx = await this.limiter.populateTransaction.addUser(address)
        let gas = await this.owner.estimateGas(tx)
        if(!gas){ throw new Error()}
        tx = await this.owner.sendTransaction(tx)
        return await tx.wait()
    }
    async removeUser(address){
        let tx = await this.limiter.populateTransaction.removeUser(address)
        let gas = await this.owner.estimateGas(tx)
        if(!gas){ throw new Error()}
        tx = await this.owner.sendTransaction(tx)
        return await tx.wait()
    }
}
module.exports.Runner = Runner

class Tester {
    /**
     * 
     * @param {String} Universal Profile 
     * @param {String} wallet 
     * @param {String} rpc 
     * @param {Number} chain 
     * @param {Boolean} performance 
     * @param {Boolean} logging 
     */
    constructor(universalProfile, keyManager, wallet, rpc, chain, performance=true, logging=true){
        this.provider = new providers.JsonRpcProvider({ url: rpc}, chain) 
        this.ethcallProvider = new multicall.Provider(this.provider, chain)
        this.keyManager = new ethers.Contract(keyManager, KeyManagerContract.abi, this.provider)
        this.universalProfile = new ethers.Contract(universalProfile, UniversalProfileContract.abi, this.provider)
        this.wallet = new ethers.Wallet(wallet, this.provider)
        this.performance = performance
        this.logging = logging
        this.chain = chain
    }
    async getQuota(address){

    }
    async getKeyManager(){
        this.keyManager = await this.universalProfile.owner()
        this.keyManager = new ethers.Contract(this.keyManager, KeyManagerContract.abi, this.provider)
    }
    async getPayload(amount, channel = 0){
        let nonce = await this.keyManager.getNonce("0xd56778301265Ac995d4E1A43556836951964843E", channel);
        let payload = await this.universalProfile.populateTransaction.execute(
            0, // The OPERATION_CALL value. 0 for a LYX transaction
            this.wallet.address, // Recipient address
            BigNumber.from("10000000000000000"), // amount of LYX to send in wei
            '0x' // Call data, to be called on the recipient address, or '0x'
        );
        // let message = web3.utils.soliditySha3(this.chain, this.keyManager.address, nonce, {
        //     t: 'bytes',
        //     v: abiPayload,
        //   })
        let message = ethers.utils.solidityKeccak256(["uint256", "address", "uint256", "bytes"], [this.chain, this.keyManager.address, nonce, payload.data])
        let signature = await this.wallet.signMessage(message);
        return {
            keyManager: this.universalProfile,
            transaction: {
              nonce: nonce,
              abi: payload.data,
              signature: signature,
            },
        }
    }
    async getTransaction(payload){
        return await this.keyManager.populateTransaction.executeRelayCall(payload.transaction.signature, payload.transaction.nonce, payload.transaction.abi)
    }
    async estimateTransaction(tx){
        return await this.wallet.estimateGas(tx)
    }
    async sendTransaction(tx){
        return await this.wallet.sendTransaction(tx)
    }
}
module.exports.Tester = Tester