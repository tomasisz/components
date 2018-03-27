const getState = require('./getState')

describe('#getInputs()', () => {
  const stateFile = {
    'function-mock': {
      type: 'function-mock',
      inputs: {
        memorySize: 512,
        timeout: 60
      }
    },
    'iam-mock': {
      type: 'iam-mock',
      inputs: {
        service: 'some.serverless.service'
      }
    }
  }

  it('should return the components inputs if present', () => {
    const expected = {
      memorySize: 512,
      timeout: 60
    }
    const res = getState(stateFile, 'function-mock')
    expect(res).toEqual(expected)
  })

  it('should return an empty object if no inputs are present', () => {
    const res = getState(stateFile, 'non-present-mock')
    expect(res).toEqual({})
  })
})
