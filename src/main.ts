import * as core from '@actions/core'
import * as cache from '@actions/tool-cache'
import * as superagent from 'superagent'
import * as crypto from 'crypto'
import * as fs from 'fs'
import * as _ from 'lodash'

enum PackageType {
  Runtime = '',
  Development = 'devel-'
}

async function validateFileChecksum(
  file: string,
  version: string,
  packageType: PackageType
): Promise<Boolean> {
  const checksumUrl = new URL(
    `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-${packageType}${version}-x86_64.pkg.sha256sum`
  )
  core.debug(`Downloading checksum from ${checksumUrl}`)
  superagent.get(checksumUrl.toString()).then(async res => {
    const fileHasher = crypto.createHash('sha256')
    const fileContents = fs.readFileSync(file)
    fileHasher.update(fileContents)
    const fileChecksum = fileHasher.digest('hex')
    core.debug(`Computed file checksum as: ${fileChecksum}`)

    const [baseChecksum, baseFilename] = _.split(res.body, ' ')
    core.debug(
      `Got base checksum: ${baseChecksum} and filename: ${baseFilename}`
    )
    if (
      baseChecksum === fileChecksum &&
      baseFilename === checksumUrl.pathname
    ) {
      core.debug('Checksum validation passed!')
      return true
    } else {
      core.debug('Checksum validation failed :(')
      return false
    }
  })
  return false
}

async function run(): Promise<void> {
  try {
    const version = core.getInput('version')
    core.debug(`Setting up GStreamer version ${version}`)

    const runtimePkgUrl = `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-${version}-x86_64.pkg`
    const developmentPkgUrl = `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-devel-${version}-x86_64.pkg`

    core.debug(`Downloading GStreamer runtime package from: ${runtimePkgUrl}`)
    const runtimePath = await cache.downloadTool(runtimePkgUrl)

    core.debug(
      `Downloading GStreamer development package from: ${developmentPkgUrl}`
    )
    const developmentPath = await cache.downloadTool(developmentPkgUrl)

    core.debug(`Validating checksum of runtime package`)
    const validRuntimePackage = await validateFileChecksum(
      runtimePath,
      version,
      PackageType.Runtime
    )

    core.debug(`Validating checksum of development package`)
    const validDevelopmentPackage = await validateFileChecksum(
      developmentPath,
      version,
      PackageType.Development
    )

    if (validRuntimePackage && validDevelopmentPackage) {
      core.debug('Hooray! Our development and runtime packages are valid!')
    }
  } catch (error) {
    core.setFailed(error.message)
  }
}

run()
