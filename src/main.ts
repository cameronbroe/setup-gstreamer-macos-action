import * as core from '@actions/core';
import * as cache from '@actions/cache';
import * as tc from '@actions/tool-cache';
import * as superagent from 'superagent';
import * as crypto from 'crypto';
import * as fs from 'fs';
import * as _ from 'lodash';
import * as path from 'path';
import * as cp from 'child_process';
import * as util from 'util';
const execute = util.promisify(cp.exec);

enum PackageType {
  Runtime = '',
  Development = 'devel-'
}

async function validateFileChecksum(file: string, version: string, packageType: PackageType): Promise<Boolean> {
  const checksumUrl = new URL(
    `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-${packageType}${version}-x86_64.pkg.sha256sum`
  );
  core.info(`Downloading checksum from ${checksumUrl}`);
  let res = await superagent.get(checksumUrl.toString());
  const fileHasher = crypto.createHash('sha256');
  const fileContents = fs.readFileSync(file);
  fileHasher.update(fileContents);
  const fileChecksum = fileHasher.digest('hex');
  core.info(`Computed file checksum as: ${fileChecksum}`);

  const [baseChecksum] = _.split(res.text.trim(), ' ');
  core.info(`Got base checksum: ${baseChecksum}`);
  if (baseChecksum === fileChecksum) {
    core.info('Checksum validation passed!');
    return true;
  } else {
    core.error('Checksum validation failed :(');
    return false;
  }
}

async function downloadAndCache(version: string): Promise<string[]> {
  try {
    const runtimePkgUrl = `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-${version}-x86_64.pkg`;
    const developmentPkgUrl = `https://gstreamer.freedesktop.org/data/pkg/osx/${version}/gstreamer-1.0-devel-${version}-x86_64.pkg`;

    core.info(`Downloading GStreamer runtime package from: ${runtimePkgUrl}`);
    const runtimePath = await tc.downloadTool(runtimePkgUrl);

    core.info(`Downloading GStreamer development package from: ${developmentPkgUrl}`);
    const developmentPath = await tc.downloadTool(developmentPkgUrl);

    core.info(`Validating checksum of runtime package`);
    const validRuntimePackage = await validateFileChecksum(runtimePath, version, PackageType.Runtime);

    core.info(`Validating checksum of development package`);
    const validDevelopmentPackage = await validateFileChecksum(developmentPath, version, PackageType.Development);

    if (validRuntimePackage && validDevelopmentPackage) {
      core.info('Hooray! Our development and runtime packages are valid!');
      const cachedRuntimePath = await tc.cacheFile(
        runtimePath,
        `gstreamer-1.0-${version}-x86_64.pkg`,
        'macos-gstreamer-runtime-pkg',
        version
      );
      const cachedDevelopmentPath = await tc.cacheFile(
        developmentPath,
        `gstreamer-1.0-devel-${version}-x86_64.pkg`,
        'macos-gstreamer-development-pkg',
        version
      );
      await cache.saveCache(
        [path.join(cachedRuntimePath, '../../'), path.join(cachedDevelopmentPath, '../../')],
        'setup-gstreamer-macos-action-cache'
      );
      return [cachedRuntimePath, cachedDevelopmentPath];
    } else {
      core.setFailed("Somethin' went wrong. :(");
      return ['', ''];
    }
  } catch (error) {
    core.setFailed(error.message);
    return ['', ''];
  }
}

(async () => {
  const version = core.getInput('version');
  core.info(`Setting up GStreamer version ${version}`);
  const cacheKey = await cache.restoreCache(
    [
      `/Users/runner/hostedtoolcache/macos-gstreamer-runtime-pkg/${version}/x64`,
      `/Users/runner/hostedtoolcache/macos-gstreamer-development-pkg/${version}/x64`
    ],
    'setup-gstreamer-macos-action-cache'
  );
  core.debug(`Retrieved cache from key: ${cacheKey}`);
  core.debug(_.join(fs.readdirSync('/Users/runner/hostedtoolcache'), '\n'));
  return;
  let cachedRuntimePkg = tc.find('macos-gstreamer-runtime-pkg', version);
  core.debug(`Found path in runtime cache: ${cachedRuntimePkg}`);
  let cachedDevelopmentPkg = tc.find('macos-gstreamer-development-pkg', version);
  core.debug(`Found path in dev cache: ${cachedDevelopmentPkg}`);
  let runtimePkgFile = path.join(cachedRuntimePkg, `gstreamer-1.0-${version}-x86_64.pkg`);
  let developmentPkgFile = path.join(cachedDevelopmentPkg, `gstreamer-1.0-devel-${version}-x86_64.pkg`);
  if (!cachedRuntimePkg && !cachedDevelopmentPkg) {
    core.info('Did not find files in cache at all');
    [cachedRuntimePkg, cachedDevelopmentPkg] = await downloadAndCache(version);
    runtimePkgFile = path.join(cachedRuntimePkg, `gstreamer-1.0-${version}-x86_64.pkg`);
    developmentPkgFile = path.join(cachedDevelopmentPkg, `gstreamer-1.0-devel-${version}-x86_64.pkg`);
  } else {
    // Let's recheck our copy just to make sure it's the same file as we expect
    let validRuntimePkg = await validateFileChecksum(runtimePkgFile, version, PackageType.Runtime);
    let validDevelopmentPkg = await validateFileChecksum(developmentPkgFile, version, PackageType.Development);

    if (!validRuntimePkg || !validDevelopmentPkg) {
      core.info('Files in cache did not match is on GStreamer mirror');
      [cachedRuntimePkg, cachedDevelopmentPkg] = await downloadAndCache(version);
      runtimePkgFile = path.join(cachedRuntimePkg, `gstreamer-1.0-${version}-x86_64.pkg`);
      developmentPkgFile = path.join(cachedDevelopmentPkg, `gstreamer-1.0-devel-${version}-x86_64.pkg`);
    }
  }
  core.info(`Installing GStreamer runtime from cached path: ${runtimePkgFile}`);
  try {
    const runtimeInstallerProcess = await execute(`sudo installer -pkg ${runtimePkgFile} -target /`);
  } catch (error) {
    core.info(error.stdout);
    core.error(error.stderr);
  }
  core.info(`Installing GStreamer development from cached path: ${developmentPkgFile}`);
  try {
    const developmentInstallerProcess = await execute(`sudo installer -pkg ${developmentPkgFile} -target /`);
  } catch (error) {
    core.info(error.stdout);
    core.error(error.stderr);
  }
})();
