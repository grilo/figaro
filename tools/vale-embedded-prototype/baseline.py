"""Fetch the historical CLI only for the opt-in, disposable comparison harness."""
import hashlib
import io
import platform
import tarfile
import urllib.request
import zipfile

ARCHIVES = {
    ('Linux', 'amd64'): ('Linux_64-bit.tar.gz', 'f59e7030c5d4ace6cf915497d0d076a1699d61e876142765963237e6867c9712'),
    ('Linux', 'arm64'): ('Linux_arm64.tar.gz', 'd49e89479a40dbe6a6fe44a2963abef0ee39d89453f3c7100bdd1c5dd0708961'),
    ('Windows', 'amd64'): ('Windows_64-bit.zip', '189b3511813a428f08a2be0d7692e50dd6e90dd81b2f8e04dbfbfe42cafd9980'),
    ('Windows', 'arm64'): ('Windows_arm64.zip', '397cf247252f205145c991b339031a39d02d947d97ac48e6516bb62118ed411f'),
    ('Darwin', 'amd64'): ('macOS_64-bit.tar.gz', '8d51cbe9ca6274fade890fc943b30dc564071dcb8fd8814abce2d0dca37fbba7'),
    ('Darwin', 'arm64'): ('macOS_arm64.tar.gz', '6b32df1a7d7b2ab01c07c1c4dd5fd84d775ac7a8f4101084cb5cc7df76bdc65e'),
}


def fetch_baseline(directory):
    arch = {'x86_64': 'amd64', 'AMD64': 'amd64', 'aarch64': 'arm64', 'ARM64': 'arm64'}.get(platform.machine(), platform.machine())
    name, expected = ARCHIVES[(platform.system(), arch)]
    url = 'https://github.com/vale-cli/vale/releases/download/v3.20.0/vale_3.20.0_' + name
    with urllib.request.urlopen(url, timeout=60) as response:
        archive = response.read(64 * 1024 * 1024 + 1)
    if hashlib.sha256(archive).hexdigest() != expected:
        raise ValueError('Historical Vale archive checksum mismatch')
    filename = 'vale.exe' if platform.system() == 'Windows' else 'vale'
    # Read one named member; never extract paths from the archive.
    if name.endswith('.zip'):
        with zipfile.ZipFile(io.BytesIO(archive)) as source:
            data = source.read(filename)
    else:
        with tarfile.open(fileobj=io.BytesIO(archive), mode='r:gz') as source:
            data = source.extractfile(filename).read()
    binary = directory / filename
    binary.write_bytes(data)
    binary.chmod(0o700)
    return binary
