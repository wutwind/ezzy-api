FROM node:24.19.0-trixie

ARG USER
ARG USER_ID

# user "node" took uid = 1000. if ARG USER_ID is equal 1000 an error will occur
# https://github.com/nodejs/docker-node/commit/c3694d8baa8a95472c007af5cadbb0068b81618e
RUN userdel -r node && \
    useradd -m -u $USER_ID -d /home/$USER $USER

USER $USER
