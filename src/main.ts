import * as core from '@actions/core'
import * as cache from '@actions/tool-cache'
import * as superagent from 'superagent'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as _ from 'lodash'
// import * as util from 'util'

enum PackageType {
  Runtime = '',
  Development = 'devel-'
}

async function validateFileChecksum(
  file: string,
  version: string,
  packageType: PackageType
): Promise<Boolean> {
  return new Promise<Boolean>(resolve => {
    const checksumUrl = new URL(
      `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-${packageType}${version}-x86_64.pkg.sha256sum`
    )
    core.info(`Downloading checksum from ${checksumUrl}`)
    superagent.get(checksumUrl.toString()).then(res => {
      const fileHasher = crypto.createHash('sha256')
      const fileContents = fs.readFileSync(file)
      fileHasher.update(fileContents)
      const fileChecksum = fileHasher.digest('hex')
      core.info(`Computed file checksum as: ${fileChecksum}`)

      const [baseChecksum] = _.split(res.text.trim(), ' ')
      core.info(`Got base checksum: ${baseChecksum}`)
      if (baseChecksum === fileChecksum) {
        core.info('Checksum validation passed!')
        resolve(true)
      } else {
        core.error('Checksum validation failed :(')
        resolve(false)
      }
    })
    resolve(false)
  })
}

async function run(): Promise<void> {
  try {
    const version = core.getInput('version')
    core.info(`Setting up GStreamer version ${version}`)

    const runtimePkgUrl = `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-${version}-x86_64.pkg`
    const developmentPkgUrl = `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-devel-${version}-x86_64.pkg`

    core.info(`Downloading GStreamer runtime package from: ${runtimePkgUrl}`)
    const runtimePath = await cache.downloadTool(runtimePkgUrl)

    core.info(
      `Downloading GStreamer development package from: ${developmentPkgUrl}`
    )
    const developmentPath = await cache.downloadTool(developmentPkgUrl)

    core.info(`Validating checksum of runtime package`)
    const validRuntimePackage = await validateFileChecksum(
      runtimePath,
      version,
      PackageType.Runtime
    )

    core.info(`Validating checksum of development package`)
    const validDevelopmentPackage = await validateFileChecksum(
      developmentPath,
      version,
      PackageType.Development
    )

    if (validRuntimePackage && validDevelopmentPackage) {
      core.info('Hooray! Our development and runtime packages are valid!')
    } else {
      core.setFailed("Somethin' went wrong. :(")
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
