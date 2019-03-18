import pkg from '../package.json'
import WalletConnect from '@walletconnect/browser'
import ProviderEngine from 'web3-provider-engine'
import CacheSubprovider from 'web3-provider-engine/subproviders/cache'
import FixtureSubprovider from 'web3-provider-engine/subproviders/fixture'
import FilterSubprovider from 'web3-provider-engine/subproviders/filters'
import HookedWalletSubprovider from 'web3-provider-engine/subproviders/hooked-wallet'
import NonceSubprovider from 'web3-provider-engine/subproviders/nonce-tracker'
import SubscriptionsSubprovider from 'web3-provider-engine/subproviders/subscriptions'

export default function WalletConnectProvider (opts) {
  const bridge = opts.bridge || null

  if (!bridge || typeof bridge !== 'string') {
    throw new Error('Missing or Invalid bridge field')
  }

  const walletConnector = new WalletConnect({ bridge })

  console.log('[WalletConnectProvider] walletConnector', walletConnector)

  const engine = new ProviderEngine()

  engine._walletConnector = walletConnector

  engine.send = (payload, callback) => {
    // Web3 1.0 beta.38 (and above) calls `send` with method and parameters
    if (typeof payload === 'string') {
      return new Promise((resolve, reject) => {
        engine.sendAsync(
          {
            jsonrpc: '2.0',
            id: 42,
            method: payload,
            params: callback || []
          },
          (error, response) => {
            if (error) {
              reject(error)
            } else {
              resolve(response.result)
            }
          }
        )
      })
    }

    // Web3 1.0 beta.37 (and below) uses `send` with a callback for async queries
    if (callback) {
      engine.sendAsync(payload, callback)
      return
    }

    let result = null
    switch (payload.method) {
      case 'eth_accounts':
        result = engine._walletConnector.accounts
        break

      case 'eth_coinbase':
        result = engine._walletConnector.accounts
        break

      case 'eth_uninstallFilter':
        engine.sendAsync(payload, _ => _)
        result = true
        break

      default:
        throw new Error(`Method ${payload.method} is not support`)
    }

    return {
      id: payload.id,
      jsonrpc: payload.jsonrpc,
      result: result
    }
  }

  engine.addProvider(
    new FixtureSubprovider({
      web3_clientVersion: `WalletConnect/v${pkg.version}/javascript`,
      net_listening: true,
      eth_hashrate: '0x00',
      eth_mining: false,
      eth_syncing: true
    })
  )

  engine.addProvider(new CacheSubprovider())
  engine.addProvider(new SubscriptionsSubprovider())
  engine.addProvider(new FilterSubprovider())
  engine.addProvider(new NonceSubprovider())

  engine.addProvider(
    new HookedWalletSubprovider({
      getAccounts: async cb => {
        const walletConnector = await engine.getWalletConnector()
        const accounts = walletConnector.accounts
        if (accounts && accounts.length) {
          cb(null, accounts)
        }
        cb(new Error('Failed to get accounts'))
      },
      sendTransaction: async (txParams, cb) => {
        const walletConnector = await engine.getWalletConnector()
        try {
          const result = await walletConnector.sendTransaction(txParams)
          cb(null, result)
        } catch (error) {
          cb(error)
        }
      },
      signTransaction: async (txParams, cb) => {
        const walletConnector = await engine.getWalletConnector()
        try {
          const result = await walletConnector.signTransaction(txParams)
          cb(null, result)
        } catch (error) {
          cb(error)
        }
      },
      signMessage: async (msgParams, cb) => {
        const walletConnector = await engine.getWalletConnector()
        try {
          const result = await walletConnector.signMessage(msgParams)
          cb(null, result)
        } catch (error) {
          cb(error)
        }
      },
      signPersonalMessage: async (msgParams, cb) => {
        const walletConnector = await engine.getWalletConnector()
        try {
          const result = await walletConnector.signPersonalMessage(msgParams)
          cb(null, result)
        } catch (error) {
          cb(error)
        }
      },
      signTypedMessage: async (msgParams, cb) => {
        const walletConnector = await engine.getWalletConnector()
        try {
          const result = await walletConnector.signTypedData(msgParams)
          cb(null, result)
        } catch (error) {
          cb(error)
        }
      }
    })
  )

  engine.addProvider({
    setEngine: _ => _,
    handleRequest: async (payload, next, end) => {
      console.log('[handleRequest] payload', payload)
      const walletConnector = await engine.getWalletConnector()
      const { error, result } = await walletConnector.sendCustomRequest(payload)
      end(error, result)
    }
  })

  engine.enable = () =>
    new Promise((resolve, reject) => {
      engine.sendAsync({ method: 'eth_accounts' }, (error, response) => {
        if (error) {
          reject(error)
        } else {
          resolve(response.result)
        }
      })
    })

  engine.getWalletConnector = () => {
    return new Promise((resolve, reject) => {
      const walletConnector = engine._walletConnector

      console.log('[getWalletConnector] walletConnector', walletConnector)

      if (!walletConnector.connected) {
        walletConnector
          .createSession()
          .then(() => {
            walletConnector.on('connect', () => {
              resolve(walletConnector)
            })
          })
          .catch(error => reject(error))
        return
      }

      resolve(walletConnector)
    })
  }

  engine.isWalletConnect = true

  engine.uri = engine._walletConnector.uri

  engine.connected = engine._walletConnector.connected

  engine.createSession = () => {
    engine._walletConnector.createSession()
  }

  engine.on = (event, callback) => {
    engine._walletConnector.on(event, callback)
  }

  engine.isConnected = () => {
    return engine.connected
  }

  engine.start()

  return engine
}
