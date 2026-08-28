# A container that runs the published package over stdio.
#
# It exists for the directories that verify a server by starting it and asking
# for its tool list. Nothing is built from this repository: the image installs
# @w3tech.io/agent-rpc-mcp from npm, so the container and the package are the
# same artifact by construction.
#
# No credential is needed to start it or to introspect it. An Ankr API key is
# needed only to call a tool, and it is read from ANKR_API_KEY at that point.
# Get one at https://www.ankr.com/rpc/.
#
#   docker build -t agent-rpc-mcp .
#   docker run --rm -i -e ANKR_API_KEY=<key> agent-rpc-mcp
FROM node:24-alpine

# Pinned on purpose: an image that silently follows the latest release is not the
# thing anyone reviewed.
ARG VERSION=0.2.3
RUN npm install -g "@w3tech.io/agent-rpc-mcp@${VERSION}"

# The server speaks JSON-RPC over stdin and stdout. It writes nothing to stdout
# that is not a protocol message.
ENTRYPOINT ["agent-rpc-mcp"]
