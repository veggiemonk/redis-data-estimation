#! /bin/bash

echo
if [ -z "${REDIS_HOST}" ]; then
    echo "Starting redis container if not already running"
    [[ $(docker ps -f "name=redis" --format '{{.Names}}') == "redis" ]] \
        || docker run -d -p 6379:6379 --name redis redis
else
    echo "Using Redis on ${REDIS_HOST}"
    echo
fi

docker run --rm -it --link redis --name node \
    -e REDIS_HOST \
    -e REDIS_PORT \
    -e COMMAND \
    -e PREFIX \
    -e TOTAL_ENTRY \
    -e MAX_ELEMENTS \
    -e MIN_ELEMENTS \
    -e BATCH_SIZE \
    -e PROGRESS \
    -e VERBOSE \
    veggiemonk/redis-data-estimation
