import path from 'path'
import { tmpdir } from 'os'
import { readFileSync } from 'fs'
import { hashElement } from 'folder-hash'
import { equals, get, isArray, keys, not, packDir, pick, resolve } from '@serverless/utils'

const createLambda = async (
  Lambda,
  {
    functionName,
    handler,
    memorySize,
    timeout,
    runtime,
    environment,
    functionDescription,
    zip,
    role
  }
) => {
  const params = {
    FunctionName: functionName,
    Code: {
      ZipFile: zip
    },
    Description: functionDescription,
    Handler: handler,
    MemorySize: memorySize,
    Publish: true,
    Role: role.arn,
    Runtime: runtime,
    Timeout: timeout,
    Environment: {
      Variables: environment
    }
  }

  const res = await Lambda.createFunction(params).promise()
  return res.FunctionArn
}

const updateLambda = async (
  Lambda,
  {
    functionName,
    handler,
    memorySize,
    timeout,
    runtime,
    environment,
    functionDescription,
    zip,
    role
  }
) => {
  const functionCodeParams = {
    FunctionName: functionName,
    ZipFile: zip,
    Publish: true
  }

  const functionConfigParams = {
    FunctionName: functionName,
    Description: functionDescription,
    Handler: handler,
    MemorySize: memorySize,
    Role: role.arn,
    Runtime: runtime,
    Timeout: timeout,
    Environment: {
      Variables: environment
    }
  }

  await Lambda.updateFunctionCode(functionCodeParams).promise()
  const res = await Lambda.updateFunctionConfiguration(functionConfigParams).promise()

  return res.FunctionArn
}

const deleteLambda = async (Lambda, name) => {
  const params = { FunctionName: name }
  await Lambda.deleteFunction(params).promise()
}

const AwsLambdaFunction = async (SuperClass, superContext) => {
  const AwsIamRole = await superContext.loadType('AwsIamRole')

  return class extends SuperClass {
    async construct(inputs, context) {
      await super.construct(inputs, context)
      const options = {
        folders: { exclude: ['node_modules'] }
      }

      this.provider = inputs.provider
      this.role = inputs.role
      this.functionName = inputs.functionName
      this.functionDescription = inputs.functionDescription
      this.handler = inputs.handler
      this.code = resolve(inputs.code) // todo use resolvable
      this.runtime = inputs.runtime
      this.memorySize = inputs.memorySize
      this.timeout = inputs.timeout
      this.environment = inputs.environment
      this.tags = inputs.tags

      let folderToHash = this.code

      if (isArray(this.code)) {
        folderToHash = this.code[0]
      }

      const hashObj = await hashElement(folderToHash, options)
      this.hash = hashObj.hash
    }

    hydrate(prevInstance) {
      super.hydrate(prevInstance)
      this.arn = get('arn', prevInstance)
    }

    shouldDeploy(prevInstance) {
      const currentConfig = {
        functionName: resolve(this.functionName),
        functionDescription: resolve(this.functionDescription),
        handler: resolve(this.handler),
        code: resolve(this.code),
        runtime: resolve(this.runtime),
        memorySize: resolve(this.memorySize),
        timeout: resolve(this.timeout),
        // environment: resolve(this.environment), todo this has a variable value
        hash: resolve(this.hash),
        tags: resolve(this.tags)
      }
      const prevConfig = prevInstance ? pick(keys(currentConfig), prevInstance) : {}
      const configChanged = not(equals(currentConfig, prevConfig))
      const roleChanged = prevInstance
        ? resolve(this.role).roleName !== prevInstance.role.roleName
        : true

      if (prevInstance && prevInstance.functionName !== currentConfig.functionName) {
        return 'replace'
      } else if (!prevInstance || configChanged || roleChanged) {
        return 'deploy'
      }
    }

    async define(context) {
      let role = resolve(this.role)
      if (!role) {
        role = await context.construct(
          AwsIamRole,
          {
            roleName: `${resolve(this.functionName)}-execution-role`,
            service: 'lambda.amazonaws.com',
            provider: this.provider
          },
          context
        )
        this.role = role
      }
      return { role }
    }

    getId() {
      return this.arn
    }

    async pack() {
      let shims = []
      let inputDirPath = this.code

      if (isArray(this.code)) {
        inputDirPath = this.code[0] // first item is path to code dir
        shims = this.code.slice() // clone array
        shims.shift() // remove first item since it's the path to code dir
      }

      const outputFileName = `${this.instanceId}-${Date.now()}.zip`
      const outputFilePath = path.join(tmpdir(), outputFileName)

      await packDir(inputDirPath, outputFilePath, shims)
      this.zip = readFileSync(outputFilePath)
      return this.zip
    }

    async deploy(prevInstance, context) {
      const provider = this.provider
      const AWS = provider.getSdk()
      const Lambda = new AWS.Lambda()
      await this.pack(context)

      if (!prevInstance || this.functionName !== prevInstance.functionName) {
        context.log(`Creating Lambda: ${this.functionName}`)
        this.arn = await createLambda(Lambda, this)
      } else {
        context.log(`Updating Lambda: ${this.functionName}`)
        this.arn = await updateLambda(Lambda, this)
      }
    }

    async remove(context) {
      const provider = this.provider
      const AWS = provider.getSdk()
      const Lambda = new AWS.Lambda()
      const functionName = this.functionName

      context.log(`Removing Lambda: ${functionName}`)

      try {
        await deleteLambda(Lambda, functionName)
      } catch (error) {
        if (!error.message.includes('Function not found')) {
          throw new Error(error)
        }
      }
    }
  }
}

export default AwsLambdaFunction
