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
  const checksumUrl = new URL(
    `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-${packageType}${version}-x86_64.pkg.sha256sum`
  )
  core.info(`Downloading checksum from ${checksumUrl}`)
  let res = await superagent.get(checksumUrl.toString())
  const fileHasher = crypto.createHash('sha256')
  const fileContents = fs.readFileSync(file)
  fileHasher.update(fileContents)
  const fileChecksum = fileHasher.digest('hex')
  core.info(`Computed file checksum as: ${fileChecksum}`)

  const [baseChecksum] = _.split(res.text.trim(), ' ')
  core.info(`Got base checksum: ${baseChecksum}`)
  if (baseChecksum === fileChecksum) {
    core.info('Checksum validation passed!')
    return true
  } else {
    core.error('Checksum validation failed :(')
    return false
  }
  return false
}

async function downloadAndCache(version: string): Promise<string[]> {
  try {
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
      const cachedRuntimePath = await cache.cacheFile(
        runtimePath,
        `gstreamer-1.0-${version}-x86_64.pkg`,
        'macos-gstreamer-runtime-pkg',
        version
      )
      const cachedDevelopmentPath = await cache.cacheFile(
        developmentPath,
        `gstreamer-1.0-devel-${version}-x86_64.pkg`,
        'macos-gstreamer-development-pkg',
        version
      )
      return [cachedRuntimePath, cachedDevelopmentPath]
    } else {
      core.setFailed("Somethin' went wrong. :(")
      return ['', '']
    }
  } catch (error) {
    core.setFailed(error.message)
    return ['', '']
  }
}

;(async () => {
  const version = core.getInput('version')
  core.info(`Setting up GStreamer version ${version}`)
  let cachedRuntimePkg = cache.find('macos-gstreamer-runtime-pkg', version)
  let cachedDevelopmentPkg = cache.find(
    'macos-gstreamer-development-pkg',
    version
  )
  if (!cachedRuntimePkg && !cachedDevelopmentPkg) {
    ;[cachedRuntimePkg, cachedDevelopmentPkg] = await downloadAndCache(version)
  } else {
    // Let's recheck our copy just to make sure it's the same file as we expect
    let validRuntimePkg = await validateFileChecksum(
      cachedRuntimePkg,
      version,
      PackageType.Runtime
    )
    let validDevelopmentPkg = await validateFileChecksum(
      cachedDevelopmentPkg,
      version,
      PackageType.Development
    )

    if (!validRuntimePkg || !validDevelopmentPkg) {
      ;[cachedRuntimePkg, cachedDevelopmentPkg] = await downloadAndCache(
        version
      )
    }
  }
  core.info(
    `Installing GStreamer runtime from cached path: ${cachedRuntimePkg}`
  )
  core.info(
    `Installing GStreamer development from cached path: ${cachedDevelopmentPkg}`
  )
})()
