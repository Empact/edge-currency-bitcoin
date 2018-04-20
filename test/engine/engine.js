// @flow
import EventEmitter from 'events'

import { makeFakeIos } from 'edge-core-js'
import type { AbcSpendInfo } from 'edge-core-js'
import { assert } from 'chai'
import { before, describe, it } from 'mocha'
import fetch from 'node-fetch'
import request from 'request'

import * as Factories from '../../src/index.js'
import dummyAddressData from './dummyAddressData.json'
import dummyHeadersData from './dummyHeadersData.json'
import dummyTransactionsData from './dummyTransactionsData.json'
import fixtures from './fixtures.json'

const DATA_STORE_FOLDER = 'txEngineFolderBTC'

for (const fixture of fixtures) {
  const CurrencyPluginFactory = Factories[fixture['factory']]
  const WALLET_TYPE = fixture['WALLET_TYPE']
  const TX_AMOUNT = fixture['TX_AMOUNT']

  let plugin, keys, engine
  const emitter = new EventEmitter()
  const [fakeIo] = makeFakeIos(1)
  const walletLocalFolder = fakeIo.folder
  const opts = {
    io: Object.assign(fakeIo, {
      random: size => fixture['key'],
      Socket: require('net').Socket,
      TLSSocket: require('tls').TLSSocket,
      fetch: fetch
    })
  }

  const callbacks = {
    onAddressesChecked (progressRatio) {
      // console.log('onAddressesCheck', progressRatio)
      emitter.emit('onAddressesCheck', progressRatio)
    },
    onBalanceChanged (currencyCode, balance) {
      console.log('onBalanceChange:', currencyCode, balance)
      emitter.emit('onBalanceChange', currencyCode, balance)
    },
    onBlockHeightChanged (height) {
      // console.log('onBlockHeightChange:', height)
      emitter.emit('onBlockHeightChange', height)
    },
    onTransactionsChanged (transactionList) {
      // console.log('onTransactionsChanged:', transactionList)
      emitter.emit('onTransactionsChanged', transactionList)
    }
  }

  describe(`Engine Creation Errors for Wallet type ${WALLET_TYPE}`, function () {
    before('Plugin', function (done) {
      CurrencyPluginFactory.makePlugin(opts).then(currencyPlugin => {
        assert.equal(
          currencyPlugin.currencyInfo.currencyCode,
          fixture['Test Currency code']
        )
        plugin = currencyPlugin
        // Hack for now until we change all the dummy data to represent the new derivation path
        plugin.currencyInfo.defaultSettings.network.keyPrefix.coinType = 0
        keys = plugin.createPrivateKey(WALLET_TYPE)
        plugin.derivePublicKey({ type: WALLET_TYPE, keys }).then(result => {
          keys = result
          done()
        })
      })
    })

    it('Error when Making Engine without local folder', function () {
      return plugin
        .makeEngine({ type: WALLET_TYPE, keys }, { callbacks })
        .catch(e => {
          assert.equal(
            e.message,
            'Cannot create an engine without a local folder'
          )
        })
    })

    it('Error when Making Engine without keys', function () {
      return plugin
        .makeEngine({ type: WALLET_TYPE }, { callbacks, walletLocalFolder })
        .catch(e => {
          assert.equal(e.message, 'Missing Master Key')
        })
    })

    it('Error when Making Engine without bitcoin key', function () {
      return plugin
        .makeEngine(
          { type: WALLET_TYPE, keys: { bitcoinXpub: keys.pub } },
          { callbacks, walletLocalFolder }
        )
        .catch(e => {
          assert.equal(e.message, 'Missing Master Key')
        })
    })
  })
  describe(`Start Engine for Wallet type ${WALLET_TYPE}`, function () {
    before('Create local cache file', function (done) {
      walletLocalFolder
        .folder(DATA_STORE_FOLDER)
        .file('addresses.json')
        .setText(JSON.stringify(dummyAddressData))
        .then(() =>
          walletLocalFolder
            .folder(DATA_STORE_FOLDER)
            .file('txs.json')
            .setText(JSON.stringify(dummyTransactionsData))
        )
        .then(() =>
          walletLocalFolder
            .folder(DATA_STORE_FOLDER)
            .file('headers.json')
            .setText(JSON.stringify(dummyHeadersData))
        )
        .then(done)
    })

    it('Make Engine', function () {
      return plugin
        .makeEngine(
          { type: WALLET_TYPE, keys, id: '1' },
          {
            callbacks,
            walletLocalFolder: walletLocalFolder.folder(DATA_STORE_FOLDER),
            optionalSettings: {
              enableOverrideServers: true,
              electrumServers: [['testnetnode.arihanc.com', '51001']]
            }
          }
        )
        .then(e => {
          engine = e
          assert.equal(typeof engine.startEngine, 'function', 'startEngine')
          assert.equal(typeof engine.killEngine, 'function', 'killEngine')
          // assert.equal(typeof engine.enableTokens, 'function', 'enableTokens')
          assert.equal(
            typeof engine.getBlockHeight,
            'function',
            'getBlockHeight'
          )
          assert.equal(typeof engine.getBalance, 'function', 'getBalance')
          assert.equal(
            typeof engine.getNumTransactions,
            'function',
            'getNumTransactions'
          )
          assert.equal(
            typeof engine.getTransactions,
            'function',
            'getTransactions'
          )
          assert.equal(
            typeof engine.getFreshAddress,
            'function',
            'getFreshAddress'
          )
          assert.equal(
            typeof engine.addGapLimitAddresses,
            'function',
            'addGapLimitAddresses'
          )
          assert.equal(typeof engine.isAddressUsed, 'function', 'isAddressUsed')
          assert.equal(typeof engine.makeSpend, 'function', 'makeSpend')
          assert.equal(typeof engine.signTx, 'function', 'signTx')
          assert.equal(typeof engine.broadcastTx, 'function', 'broadcastTx')
          assert.equal(typeof engine.saveTx, 'function', 'saveTx')
          return true
        })
    })
  })

  describe(`Is Address Used for Wallet type ${WALLET_TYPE} from cache`, function () {
    it('Checking a wrong formated address', function (done) {
      try {
        engine.isAddressUsed('TestErrorWithWrongAddress')
      } catch (e) {
        assert(e, 'Should throw')
        assert.equal(e.message, 'Wrong formatted address')
        done()
      }
    })

    it("Checking an address we don't own", function () {
      try {
        assert.equal(
          engine.isAddressUsed('mnSmvy2q4dFNKQF18EBsrZrS7WEy6CieEE'),
          false
        )
      } catch (e) {
        assert(e, 'Should throw')
        assert.equal(e.message, 'Address not found in wallet')
      }
    })

    // it('Checking an empty P2WSH address', function (done) {
    //   assert.equal(engine.isAddressUsed('tb1qng4wvp6chgm6erdc8hcgn7ewpkv8gqlm6m6ja6'), false)
    //   done()
    // })

    // it('Checking a non empty P2WSH address', function (done) {
    //   assert.equal(engine.isAddressUsed('tb1qprslq433fsq8pjdw3tu3x3ynk5f486ngp8lrxu'), true)
    //   done()
    // })

    it('Checking an empty P2SH address', function (done) {
      assert.equal(
        engine.isAddressUsed('2N9DbpGaQEeLLZgPQP4gc9oKkrFHdsj5Eew'),
        false
      )
      done()
    })

    it('Checking a non empty P2SH address 1', function (done) {
      assert.equal(
        engine.isAddressUsed('2MwLo2ghJeXTgpDccHGcsTbdS9YVfM3K5GG'),
        true
      )
      done()
    })

    it('Checking a non empty P2SH address 2', function (done) {
      assert.equal(
        engine.isAddressUsed('2MxRjw65NxR4DsRj2z1f5xFnKkU5uMRCsoT'),
        true
      )
      done()
    })

    it('Checking a non empty P2SH address 3', function (done) {
      assert.equal(
        engine.isAddressUsed('2MxvxJh44wq17vhzGqFcAsuYsVmdEJKWuFV'),
        true
      )
      done()
    })
  })

  describe(`Get Transactions from Wallet type ${WALLET_TYPE}`, function () {
    it('Should get number of transactions from cache', function (done) {
      assert.equal(
        engine.getNumTransactions(),
        TX_AMOUNT,
        `should have ${TX_AMOUNT} tx from cache`
      )
      done()
    })

    it('Should get transactions from cache', function (done) {
      engine.getTransactions().then(txs => {
        assert.equal(
          txs.length,
          TX_AMOUNT,
          `should have ${TX_AMOUNT} tx from cache`
        )
        done()
      })
    })

    it('Should get transactions from cache with options', function (done) {
      engine.getTransactions({ startIndex: 1, numEntries: 2 }).then(txs => {
        assert.equal(txs.length, 2, 'should have 2 tx from cache')
        done()
      })
    })
  })

  describe('Should Add Gap Limit Addresses', function () {
    it('Add Empty Array', function (done) {
      engine.addGapLimitAddresses([])
      done()
    })

    it('Add Already Derived Addresses', function (done) {
      engine.addGapLimitAddresses([
        '2MvNRPakFUtKSe7ZYcyextQd3sfSEKiqUHY',
        '2MxRjw65NxR4DsRj2z1f5xFnKkU5uMRCsoT'
      ])
      done()
    })

    // it('Add Future Addresses', function (done) {
    //   engine.addGapLimitAddresses([])
    //   done()
    // })
  })

  describe('Should start engine', function () {
    it('Get BlockHeight', function (done) {
      this.timeout(10000)
      request.get(
        'https://api.blocktrail.com/v1/tBTC/block/latest?api_key=MY_APIKEY',
        (err, res, body) => {
          assert(!err, 'getting block height from a second source')
          let thirdPartyHeight = parseInt(JSON.parse(body).height)
          if (!thirdPartyHeight || isNaN(thirdPartyHeight)) {
            thirdPartyHeight = 1286739
          }
          emitter.on('onBlockHeightChange', height => {
            if (height >= thirdPartyHeight) {
              emitter.removeAllListeners('onBlockHeightChange')
              assert(
                engine.getBlockHeight() >= thirdPartyHeight,
                'Block height'
              )
              done() // Can be "done" since the promise resolves before the event fires but just be on the safe side
            }
          })
          engine.startEngine().catch(e => {
            console.log('startEngine error', e, e.message)
          })
        }
      )
    })
  })

  describe(`Get Wallet Keys for Wallet type ${WALLET_TYPE}`, function () {
    it('get private key', function (done) {
      engine.getDisplayPrivateSeed()
      done()
    })
    it('get public key', function (done) {
      engine.getDisplayPublicSeed()
      done()
    })
  })

  // describe(`Is Address Used for Wallet type ${WALLET_TYPE} from network`, function () {
  //   it('Checking a non empty P2WSH address', function (done) {
  //     setTimeout(() => {
  //       assert.equal(engine.isAddressUsed('tb1qzsqz3akrp8745gsrl45pa2370gculzwx4qcf5v'), true)
  //       done()
  //     }, 1000)
  //   })

  //   it('Checking a non empty address P2SH', function (done) {
  //     setTimeout(() => {
  //       assert.equal(engine.isAddressUsed('2MtegHVwZFy88UjdHU81wWiRkwDq5o8pWka'), true)
  //       done()
  //     }, 1000)
  //   })
  // })

  describe(`Get Fresh Address for Wallet type ${WALLET_TYPE}`, function () {
    it('Should provide a non used BTC address when no options are provided', function (done) {
      this.timeout(10000)
      setTimeout(() => {
        const address = engine.getFreshAddress()
        request.get(
          `https://api.blocktrail.com/v1/tBTC/address/${
            address.publicAddress
          }?api_key=MY_APIKEY`,
          (err, res, body) => {
            const code = parseInt(JSON.parse(body).code)
            if (!err && code !== 429) {
              const thirdPartyBalance = parseInt(JSON.parse(body).received)
              assert(!err, 'getting address incoming txs from a second source')
              assert(
                thirdPartyBalance === 0,
                'Should have never received coins'
              )
            } else {
              const scriptHash =
                engine.engineState.scriptHashes[address.publicAddress]
              const transactions =
                engine.engineState.addressInfos[scriptHash].txids
              assert(
                transactions.length === 0,
                'Should have never received coins'
              )
            }
            done()
          }
        )
      }, 2000)
    })
  })

  describe(`Make Spend and Sign for Wallet type ${WALLET_TYPE}`, function () {
    it('Should fail since no spend target is given', function () {
      const abcSpendInfo = {
        networkFeeOption: 'high',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        }
      }
      return engine.makeSpend(abcSpendInfo).catch(e => {
        assert(e, 'Should throw')
      })
    })

    it('Should build transaction with low fee', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'low',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        spendTargets: [
          {
            currencyCode: 'BTC',
            publicAddress: '2MutAAY6tW2HEyrhSadT1aQhP4KdCAKkC74',
            nativeAmount: '210000' // 0.021 BTC
          },
          {
            currencyCode: 'BTC',
            publicAddress: 'tb1qzu5e2xhmh7lyfs38yq0u7xmem37ufp6tp6uh6q',
            nativeAmount: '420000' // 0.042 BTC
          }
        ]
      }
      // $FlowFixMe
      return engine
        .makeSpend(templateSpend)
        .then(a => {
          return engine.signTx(a)
        })
        .then(a => {
          // console.log('sign', a)
        })
    })

    it('Should build transaction with low standard fee', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'standard',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        spendTargets: [
          {
            currencyCode: 'BTC',
            publicAddress: '2MutAAY6tW2HEyrhSadT1aQhP4KdCAKkC74',
            nativeAmount: '17320'
          }
        ]
      }
      return engine
        .makeSpend(templateSpend)
        .then(a => {
          return engine.signTx(a)
        })
        .then(a => {
          // console.log('sign', a)
        })
    })

    it('Should build transaction with middle standard fee', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'standard',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        spendTargets: [
          {
            currencyCode: 'BTC',
            publicAddress: '2MutAAY6tW2HEyrhSadT1aQhP4KdCAKkC74',
            nativeAmount: '43350000'
          }
        ]
      }
      return engine
        .makeSpend(templateSpend)
        .then(a => {
          return engine.signTx(a)
        })
        .then(a => {
          // console.log('sign', a)
        })
    })

    it('Should build transaction with high standard fee', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'standard',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        spendTargets: [
          {
            currencyCode: 'BTC',
            publicAddress: '2MutAAY6tW2HEyrhSadT1aQhP4KdCAKkC74',
            nativeAmount: '86700000'
          },
          {
            currencyCode: 'BTC',
            publicAddress: 'tb1qzu5e2xhmh7lyfs38yq0u7xmem37ufp6tp6uh6q',
            nativeAmount: '420000' // 0.042 BTC
          }
        ]
      }
      return engine
        .makeSpend(templateSpend)
        .then(a => {
          return engine.signTx(a)
        })
        .then(a => {
          // console.log('sign', a)
        })
    })

    it('Should build transaction with high fee', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'high',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        spendTargets: [
          {
            currencyCode: 'BTC',
            publicAddress: '2MutAAY6tW2HEyrhSadT1aQhP4KdCAKkC74',
            nativeAmount: '210000' // 0.021 BTC
          },
          {
            currencyCode: 'BTC',
            publicAddress: 'tb1qzu5e2xhmh7lyfs38yq0u7xmem37ufp6tp6uh6q',
            nativeAmount: '420000' // 0.042 BTC
          }
        ]
      }
      return engine
        .makeSpend(templateSpend)
        .then(a => {
          return engine.signTx(a)
        })
        .then(a => {
          // console.log('sign', a)
        })
    })

    it('Should build transaction with custom fee', function () {
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'custom',
        customNetworkFee: { satPerByte: '1000' },
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        spendTargets: [
          {
            currencyCode: 'BTC',
            publicAddress: '2MutAAY6tW2HEyrhSadT1aQhP4KdCAKkC74',
            nativeAmount: '210000' // 0.021 BTC
          },
          {
            currencyCode: 'BTC',
            publicAddress: 'tb1qzu5e2xhmh7lyfs38yq0u7xmem37ufp6tp6uh6q',
            nativeAmount: '420000' // 0.042 BTC
          }
        ]
      }
      // $FlowFixMe
      return engine
        .makeSpend(templateSpend)
        .then(function (a) {
          // console.log('makeSpend', a)
          return engine.signTx(a)
        })
        .then(function (a) {
          // console.log('signTx', a)
          // console.log('signTx', a.otherParams.bcoinTx.inputs)
        })
    })

    it('Should throw InsufficientFundsError', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'high',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        spendTargets: [
          {
            currencyCode: 'BTC',
            publicAddress: '2MutAAY6tW2HEyrhSadT1aQhP4KdCAKkC74',
            nativeAmount: '2100000000' // 0.021 BTC
          },
          {
            currencyCode: 'BTC',
            publicAddress: 'tb1qzu5e2xhmh7lyfs38yq0u7xmem37ufp6tp6uh6q',
            nativeAmount: '420000' // 0.042 BTC
          }
        ]
      }
      // $FlowFixMe
      return engine
        .makeSpend(templateSpend)
        .catch(e => assert.equal(e.message, 'InsufficientFundsError'))
    })

    it('Should throw InsufficientFundsError for a really big amount', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'high',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        spendTargets: [
          {
            currencyCode: 'BTC',
            publicAddress: '2MutAAY6tW2HEyrhSadT1aQhP4KdCAKkC74',
            nativeAmount: '9999999999999000000000' // 0.021 BTC
          },
          {
            currencyCode: 'BTC',
            publicAddress: 'tb1qzu5e2xhmh7lyfs38yq0u7xmem37ufp6tp6uh6q',
            nativeAmount: '9999999999999000000000' // 0.042 BTC
          }
        ]
      }
      // $FlowFixMe
      return engine
        .makeSpend(templateSpend)
        .catch(e => assert.equal(e.message, 'InsufficientFundsError'))
    })
  })

  describe(`Sweep Keys and Sign for Wallet type ${WALLET_TYPE}`, function () {
    it('Should build transaction with low fee', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'low',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        privateKeys: ['cQSzMGPwF7uWP2jRcLxndSvgepeVXJ1DLVrDu7gRJS3kZDmHHXsp']
      }
      // $FlowFixMe
      return engine
        .sweepPrivateKeys(templateSpend)
        .then(a => {
          return engine.signTx(a)
        })
        .then(a => {
          // console.log('sign', a)
        })
    })

    it('Should build transaction with low standard fee', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'low',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        privateKeys: ['cQSzMGPwF7uWP2jRcLxndSvgepeVXJ1DLVrDu7gRJS3kZDmHHXsp']
      }
      return engine
        .sweepPrivateKeys(templateSpend)
        .then(a => {
          return engine.signTx(a)
        })
        .then(a => {
          // console.log('sign', a)
        })
    })

    it('Should build transaction with high fee', function () {
      // $FlowFixMe
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'high',
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        privateKeys: ['cQSzMGPwF7uWP2jRcLxndSvgepeVXJ1DLVrDu7gRJS3kZDmHHXsp']
      }
      return engine
        .sweepPrivateKeys(templateSpend)
        .then(a => {
          return engine.signTx(a)
        })
        .then(a => {
          // console.log('sign', a)
        })
    })

    it('Should build transaction with custom fee', function () {
      const templateSpend: AbcSpendInfo = {
        networkFeeOption: 'custom',
        customNetworkFee: { satPerByte: '1000' },
        metadata: {
          name: 'Transfer to College Fund',
          category: 'Transfer:Wallet:College Fund'
        },
        privateKeys: ['cQSzMGPwF7uWP2jRcLxndSvgepeVXJ1DLVrDu7gRJS3kZDmHHXsp']
      }
      // $FlowFixMe
      return engine
        .sweepPrivateKeys(templateSpend)
        .then(function (a) {
          // console.log('makeSpend', a)
          return engine.signTx(a)
        })
        .then(function (a) {
          // console.log('signTx', a)
          // console.log('signTx', a.otherParams.bcoinTx.inputs)
        })
    })
  })

  describe(`Stop Engine for Wallet type ${WALLET_TYPE}`, function () {
    it('dump the wallet data', function (done) {
      const dataDump = engine.dumpData()
      assert(dataDump.walletId === '1', 'walletId')
      assert(
        dataDump.walletType === 'wallet:bitcoin-bip49-testnet',
        'walletType'
      )
      assert(dataDump.pluginType === 'bitcointestnet', 'pluginType')
      done()
    })

    it('Stop the engine', function (done) {
      console.log('kill engine')
      engine.killEngine().then(done)
    })
  })
}
