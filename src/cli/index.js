/*
 * Serverless Components: CLI Handler
 */

const path = require('path')
const args = require('minimist')(process.argv.slice(2))
const { loadInstanceConfig, fileExistsSync } = require('./utils')
const instanceConfig = loadInstanceConfig(process.cwd())
const stage = args.stage || (instanceConfig && instanceConfig.stage) || 'dev'

// Load environment variables from eventual .env files
const dotenv = require('dotenv')
const defaultEnvFilePath = path.join(process.cwd(), `.env`)
const stageEnvFilePath = path.join(process.cwd(), `.env.${stage}`)
if (stage && fileExistsSync(stageEnvFilePath)) {
  dotenv.config({ path: path.resolve(stageEnvFilePath) })
} else if (fileExistsSync(defaultEnvFilePath)) {
  dotenv.config({ path: path.resolve(defaultEnvFilePath) })
}

const { utils: platformUtils } = require('@serverless/tencent-platform-client')
const CLI = require('./CLI')

let commands
if (platformUtils.isChinaUser()) {
  commands = require('./commands-cn')
} else {
  commands = require('./commands')
}

module.exports = async () => {
  const command = args._[0] || 'deploy'
  const params = []
  if (args._[1]) {
    params.push(args._[1])
  }
  if (args._[2]) {
    params.push(args._[2])
  }
  if (args._[3]) {
    params.push(args._[3])
  }
  if (args._[4]) {
    params.push(args._[4])
  }

  const config = { ...args, params }
  if (config._) {
    delete config._
  }

  config.platformStage = process.env.SERVERLESS_PLATFORM_STAGE || 'prod'
  config.debug = process.env.SLS_DEBUG || (args.debug ? true : false)

  // Add stage environment variable
  if (args.stage && !process.env.SERVERLESS_STAGE) {
    process.env.SERVERLESS_STAGE = args.stage
  }
  // Start CLI process
  const cli = new CLI(config)

  const checkingVersion = args._[0] === 'version' || args.version || args.v

  // if the user is checking the version, just log it and exit
  if (checkingVersion) {
    return cli.logVersion()
  }

  try {
    if (commands[command]) {
      await commands[command](config, cli)
    } else {
      await commands.run(config, cli, command)
    }
  } catch (e) {
    return cli.error(e)
  }
}
