FROM docker.io/library/debian@sha256:c67e92c8099ba22853ab4cfda7cfb494d253d6012ca82dee98ba8976772af018 AS runtime-deps

# Pin the complete package resolution to a signed Debian archive snapshot.
# The minimal base has no CA bundle. APT verifies the signed Release and package hashes.
RUN set -eux; \
    rm -f /etc/apt/sources.list.d/debian.sources; \
    printf '%s\n' \
      'deb [check-valid-until=no signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] http://snapshot.debian.org/archive/debian/20261120T000000Z/ bookworm main' \
      'deb [check-valid-until=no signed-by=/usr/share/keyrings/debian-archive-keyring.gpg] http://snapshot.debian.org/archive/debian-security/20261120T000000Z/ bookworm-security main' \
      >/etc/apt/sources.list.d/pbos-snapshot.list; \
    apt-get -o Acquire::Retries=3 -o Acquire::Languages=none update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      bubblewrap ca-certificates curl libcurl4 libexpat1 libssl3 passwd python3 util-linux zlib1g; \
    rm -rf /var/lib/apt/lists/*

# The Sandbox source initializer uses git clone --revision (Git 2.49+).
# Keep the toolchain in a separate stage and use the same signed APT snapshot.
FROM runtime-deps AS git-build
RUN set -eux; \
    apt-get -o Acquire::Retries=3 -o Acquire::Languages=none update; \
    DEBIAN_FRONTEND=noninteractive apt-get install -y --no-install-recommends \
      gcc libc6-dev libcurl4-openssl-dev libexpat1-dev libssl-dev make xz-utils zlib1g-dev; \
    curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 3 \
      --output /tmp/git-2.54.1.tar.xz \
      https://www.kernel.org/pub/software/scm/git/git-2.54.1.tar.xz; \
    printf '%s  %s\n' ca988eb9af7d8770339df7cdc38106fec8244664ff886840767cb9be3ef0e16c /tmp/git-2.54.1.tar.xz | sha256sum -c -; \
    tar -xJf /tmp/git-2.54.1.tar.xz -C /tmp; \
    make -C /tmp/git-2.54.1 -j2 prefix=/usr/local DESTDIR=/opt/pbos-git \
      NO_GETTEXT=YesPlease NO_PERL=YesPlease NO_PYTHON=YesPlease NO_TCLTK=YesPlease install

FROM runtime-deps
COPY --from=git-build /opt/pbos-git/usr/local/ /usr/local/
RUN test "$(git --version)" = "git version 2.54.1"

# Release asset digest and unpacked executable digest are independent pins.
RUN set -eux; \
    curl --proto '=https' --tlsv1.2 --fail --silent --show-error --location --retry 3 \
      --output /tmp/pbos-codex.tar.gz \
      https://github.com/openai/codex/releases/download/rust-v0.171.0/codex-x86_64-unknown-linux-musl.tar.gz; \
    printf '%s  %s\n' 01baa2e47809f8597be5b2f8abd4e4dfe3fb5bcb6e504c2fbaaad97056c15e8d /tmp/pbos-codex.tar.gz | sha256sum -c -; \
    tar -xOzf /tmp/pbos-codex.tar.gz codex-x86_64-unknown-linux-musl >/tmp/pbos-codex; \
    printf '%s  %s\n' b76a027d6b210f9a8da7aaf321dd235c700f0ef7a794d4a5314b9af6c134f0f0 /tmp/pbos-codex | sha256sum -c -; \
    install -o root -g root -m 0755 /tmp/pbos-codex /usr/local/bin/codex; \
    rm /tmp/pbos-codex /tmp/pbos-codex.tar.gz
