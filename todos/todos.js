var model = (function () {
          return function model($model, $funcLibRaw, $batchingStrategy) {
    let $funcLib = $funcLibRaw

    if (/* DEBUG */true) {
    $funcLib = (!$funcLibRaw || typeof Proxy === 'undefined') ? $funcLibRaw : new Proxy($funcLibRaw, {
      get: (target, functionName) => {
        if (target[functionName]) {
          return target[functionName]
        }

        throw new TypeError(`Trying to call undefined function: ${functionName} `)
    }})
  }

  function mathFunction(name, source) {
    return arg => {
      const type = typeof arg
      if (type !== 'number') {
        throw new TypeError(`Trying to call ${JSON.stringify(arg)}.${name}. Expects number, received ${type} at ${source}`)
      }

      return Math[name](arg)
    }
  }

  function checkTypes(input, name, types, functionName, source) {
    function checkType(type) {
      const isArray = Array.isArray(input)
      return type == 'array' && isArray || (type === typeof input && !isArray)
    }

    if (types.some(checkType)) {
      return
    }

    const asString = typeof input === 'object' ? JSON.stringify(input) : input

    throw new TypeError(`${functionName} expects ${types.join('/')}. ${name} at ${source}: ${asString}.${functionName}`)
  }

  const $res = { $model };
    const $listeners = new Set();
    const $trackingMap = new WeakMap();
    const $trackingWildcards = new WeakMap();
    const $invalidatedMap = new WeakMap();
    const $invalidatedRoots = new Set();
    $invalidatedRoots.$subKeys = {};
    $invalidatedRoots.$parentKey = null;
    $invalidatedRoots.$parent = null;
    $invalidatedRoots.$tracked = {};
    let $first = true;
    let $tainted = new WeakSet();
    $invalidatedMap.set($res, $invalidatedRoots);

    const collectAllItems = (res, obj, prefix) => {
      if (typeof obj !== 'object') {
        return;
      }
      res.set(obj, prefix);
      const keys = Array.isArray(obj) ? new Array(obj.length).fill().map((_, idx) => idx) : Object.keys(obj);
      keys.forEach(idx => {
        const child = obj[idx];
        if (typeof child === 'object') {
          collectAllItems(res, child, `${prefix}.${idx}`);
        }
      });
    };

    const serialize = (all, obj) => {
      if (all.has(obj)) {
        return all.get(obj);
      } else if (obj instanceof WeakMap) {
        return Array.from(all.keys()).reduce((acc, item) => {
          if (obj.has(item)) {
            acc[all.get(item)] = serialize(all, obj.get(item));
          }
          return acc;
        }, {});
      } else if (obj instanceof Map) {
        return Array.from(obj.keys()).reduce((acc, item) => {
          if (all.has(item)) {
            acc[all.get(item)] = serialize(all, obj.get(item));
          } else {
            acc[item] = serialize(all, obj.get(item));
          }
          return acc;
        }, {});
      } else if (obj instanceof Set || obj instanceof Array) {
        return Array.from(obj).map(x => (all.has(x) ? all.get(x) : serialize(all, x)));
      } else if (typeof obj === 'object') {
        return Object.keys(obj).reduce((acc, key) => {
          acc[key] = serialize(all, obj[key]);
          return acc;
        }, {});
      } else {
        return obj;
      }
    };

    const debug = () => {
      const all = new Map();
      collectAllItems(all, $model, '$model');
      collectAllItems(all, $res, '$res');
      console.log(`Found ${all.size} records`);
      console.log(JSON.stringify(serialize(all, { $trackingMap, $invalidatedMap }), null, 2));
    };

    const untrack = ($targetKeySet, $targetKey) => {
      const $tracked = $targetKeySet.$tracked;
      if (!$tracked || !$tracked[$targetKey]) {
        return;
      }
      const $trackedByKey = $tracked[$targetKey];
      for (let i = 0; i < $trackedByKey.length; i+=3) {
        const $trackingSource = $trackingMap.get($trackedByKey[i]);
        $trackingSource[$trackedByKey[i+1]].delete($trackedByKey[i+2]);
      }
      delete $tracked[$targetKey];
    };

    const invalidate = ($targetKeySet, $targetKey) => {
      if ($targetKeySet.has($targetKey)) {
        return;
      }
      $targetKeySet.add($targetKey);
      untrack($targetKeySet, $targetKey);
      if ($targetKeySet.$parent) {
        invalidate($targetKeySet.$parent, $targetKeySet.$parentKey);
      }
    };

    function setOnObject($target, $key, $val, $invalidates) {
      let $changed = false;
      let $hard = false;
      if ($invalidates && !$first) {
        if (typeof $target[$key] === 'object' && $target[$key] && $target[$key] !== $val) {
          $hard = true;
        }
        if (
          $hard ||
          $target[$key] !== $val ||
          ($val && typeof $val === 'object' && $tainted.has($val)) ||
          (!$target.hasOwnProperty($key) && $target[$key] === undefined)
        ) {
          $changed = true;
          triggerInvalidations($target, $key, $hard);
        }
      }
      $target[$key] = $val;
      return $changed;
    }

    function deleteOnObject($target, $key, $invalidates) {
      let $hard = false;
      if ($invalidates) {
        if (typeof $target[$key] === 'object' && $target[$key]) {
          $hard = true;
        }
        triggerInvalidations($target, $key, $hard);
      }
      const $invalidatedKeys = $invalidatedMap.get($target);
      if ($invalidatedKeys) {
        delete $invalidatedKeys.$subKeys[$key]
      }
      delete $target[$key];
    }

    function setOnArray($target, $key, $val, $invalidates) {
      let $hard = false;
      if ($invalidates && !$first) {
        if (typeof $target[$key] === 'object' && $target[$key] && $target[$key] !== $val) {
          $hard = true;
        }
        if (
          $hard ||
          $key >= $target.length ||
          $target[$key] !== $val ||
          ($val && typeof $target[$key] === 'object' && $tainted.has($val))
        ) {
          triggerInvalidations($target, $key, $hard);
        }
      }
      $target[$key] = $val;
    }

    function truncateArray($target, newLen, $invalidates) {
      if ($invalidates) {
        for (let i = newLen; i <$target.length;i++) {
          triggerInvalidations($target, i, true);
        }
      }
      $target.length = newLen;
    }

    function track($target, $sourceObj, $sourceKey, $soft) {
      if (!$trackingMap.has($sourceObj)) {
        $trackingMap.set($sourceObj, {});
      }
      const $track = $trackingMap.get($sourceObj);
      $track[$sourceKey] = $track[$sourceKey] || new Map();
      $track[$sourceKey].set($target, $soft);
      const $tracked = $target[0].$tracked;
      $tracked[$target[1]] = $tracked[$target[1]] || [];
      $tracked[$target[1]].push($sourceObj, $sourceKey, $target);
    }

    function trackPath($target, $path) {
      const $end = $path.length - 2;
      let $current = $path[0];
      for (let i = 0; i <= $end; i++) {
        track($target, $current, $path[i + 1], i !== $end);
        $current = $current[$path[i + 1]];
      }
    }

    function triggerInvalidations($sourceObj, $sourceKey, $hard) {
      $tainted.add($sourceObj);
      const $track = $trackingMap.get($sourceObj);
      if ($track && $track.hasOwnProperty($sourceKey)) {
        $track[$sourceKey].forEach(($soft, $target) => {
          if (!$soft || $hard) {
            invalidate($target[0], $target[1]);
          }
        });
      }
      if ($trackingWildcards.has($sourceObj)) {
        $trackingWildcards.get($sourceObj).forEach($targetInvalidatedKeys => {
          invalidate($targetInvalidatedKeys, $sourceKey);
        });
      }
    }

    function initOutput($tracked, src, func, createDefaultValue, createCacheValue) {
      const subKeys = $tracked[0].$subKeys;
      const $cachePerTargetKey = subKeys[$tracked[1]] = subKeys[$tracked[1]] || new Map();
      let $cachedByFunc = $cachePerTargetKey.get(func);
      if (!$cachedByFunc) {
        const $resultObj = createDefaultValue();
        const $cacheValue = createCacheValue();
        const $invalidatedKeys = new Set();
        $invalidatedKeys.$subKeys = {};
        $invalidatedKeys.$parentKey = $tracked[1];
        $invalidatedKeys.$parent = $tracked[0];
        $invalidatedKeys.$tracked = {};
        $invalidatedMap.set($resultObj, $invalidatedKeys);
        $cachedByFunc = [null, $resultObj, $invalidatedKeys, true, $cacheValue];
        $cachePerTargetKey.set(func, $cachedByFunc);
      } else {
        $cachedByFunc[3] = false;
      }
      const $invalidatedKeys = $cachedByFunc[2];
      const $prevSrc = $cachedByFunc[0];
      if ($prevSrc !== src) {
        if ($prevSrc) { // prev mapped to a different collection
          $trackingWildcards.get($prevSrc).delete($invalidatedKeys);
          if (Array.isArray($prevSrc)) {
            $prevSrc.forEach((_item, index) => $invalidatedKeys.add(index));
          } else {
            Object.keys($prevSrc).forEach(key => $invalidatedKeys.add(key));
          }
          if (Array.isArray(src)) {
            src.forEach((_item, index) => $invalidatedKeys.add(index));
          } else {
            Object.keys(src).forEach(key => $invalidatedKeys.add(key));
          }
        }
        if (!$trackingWildcards.has(src)) {
          $trackingWildcards.set(src, new Set());
        }
        $trackingWildcards.get(src).add($invalidatedKeys);
        $cachedByFunc[0] = src;
      }
      return $cachedByFunc;
    }

    const emptyObj = () => ({});
    const emptyArr = () => [];
    const nullFunc = () => null;

    function mapValuesOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      (($new && Object.keys(src)) || $invalidatedKeys).forEach(key => {
        if (!src.hasOwnProperty(key)) {
          if ($out.hasOwnProperty(key)) {
            deleteOnObject($out, key, $invalidates);
          }
        } else {
          const res = func([$invalidatedKeys, key], key, src[key], context);
          setOnObject($out, key, res, $invalidates);
        }
      });
      $invalidatedKeys.clear();
      return $out;
    }


    function filterByOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      (($new && Object.keys(src)) || $invalidatedKeys).forEach(key => {
        if (!src.hasOwnProperty(key)) {
          if ($out.hasOwnProperty(key)) {
            deleteOnObject($out, key, $invalidates);
          }
        } else {
          const res = func([$invalidatedKeys, key], key, src[key], context);
          if (res) {
            setOnObject($out, key, src[key], $invalidates);
          } else if ($out.hasOwnProperty(key)) {
            deleteOnObject($out, key, $invalidates);
          }
        }
      });
      $invalidatedKeys.clear();
      return $out;
    }

    function mapOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      if ($new) {
        for (let key = 0; key < src.length; key++) {
          const res = func([$invalidatedKeys, key], key, src[key], context);
          setOnArray($out, key, res, $invalidates);
        }
      } else {
        $invalidatedKeys.forEach(key => {
          if (key < src.length) {
            const res = func([$invalidatedKeys, key], key, src[key], context);
            setOnArray($out, key, res, $invalidates);
          }
        })
        if ($out.length > src.length) {
          truncateArray($out, src.length, $invalidates)
        }
      }
      $invalidatedKeys.clear();
      return $out;
    }

    function recursiveSteps(key, $tracked) {
      const { $dependencyMap, $currentStack, $invalidatedKeys, $out, func, src, context, $invalidates } = this;
      if ($currentStack.length > 0) {
        if (!$dependencyMap.has(key)) {
          $dependencyMap.set(key, []);
        }
        $dependencyMap.get(key).push($tracked);
      }
      if ($invalidatedKeys.has(key)) {
        $currentStack.push(key);
        if (Array.isArray($out)) {
          if (key >= src.length) {
            setOnArray($out, key, undefined, $invalidates);
            $out.length = src.length;
          } else {
            const newVal = func([$invalidatedKeys, key], key, src[key], context, this);
            setOnArray($out, key, newVal, $invalidates)
          }
        } else {
          if (!src.hasOwnProperty(key)) {
            if ($out.hasOwnProperty(key)) {
              deleteOnObject($out, key, $invalidates);
            }
          } else {
            const newVal = func([$invalidatedKeys, key], key, src[key], context, this);
            setOnObject($out, key, newVal, $invalidates)
          }
        }
        $invalidatedKeys.delete(key);
        $currentStack.pop();
      }
      return $out[key];
    }

    function cascadeRecursiveInvalidations($loop) {
      const { $dependencyMap, $invalidatedKeys } = $loop;
      $invalidatedKeys.forEach(key => {
        if ($dependencyMap.has(key)) {
          $dependencyMap.get(key).forEach(($tracked) => {
            invalidate($tracked[0], $tracked[1]);
          });
          $dependencyMap.delete(key);
        }
      });
    }

    const recursiveCacheFunc = () => ({
      $dependencyMap: new Map(),
      $currentStack: [],
      recursiveSteps
    })

    function recursiveMapOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, recursiveCacheFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $loop = $storage[4];
      $loop.$invalidatedKeys = $invalidatedKeys;
      $loop.$out = $out;
      $loop.context = context;
      $loop.func = func;
      $loop.src = src;
      $loop.$invalidates = $invalidates;

      if ($new) {
        for (let key = 0; key < src.length; key++) {
          $invalidatedKeys.add(key);
        }
        for (let key = 0; key < src.length; key++) {
          $loop.recursiveSteps(key, [$invalidatedKeys, key]);
        }
      } else {
        cascadeRecursiveInvalidations($loop);
        $invalidatedKeys.forEach(key => {
          $loop.recursiveSteps(key, [$invalidatedKeys, key]);
        });
      }
      $invalidatedKeys.clear();
      return $out;
    }

    function recursiveMapValuesOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, recursiveCacheFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $loop = $storage[4];
      $loop.$invalidatedKeys = $invalidatedKeys;
      $loop.$out = $out;
      $loop.context = context;
      $loop.func = func;
      $loop.src = src;
      $loop.$invalidates = $invalidates;

      if ($new) {
        Object.keys(src).forEach(key => $invalidatedKeys.add(key));
        Object.keys(src).forEach(key => $loop.recursiveSteps(key, $invalidatedKeys, key));
      } else {
        cascadeRecursiveInvalidations($loop);
        $invalidatedKeys.forEach(key => {
          $loop.recursiveSteps(key, $invalidatedKeys, key);
        });
      }
      $invalidatedKeys.clear();
      return $out;
    }

    function keyByOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, emptyArr);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $idxToKey = $storage[4];
      if ($new) {
        for (let key = 0; key < src.length; key++) {
          const newKey = '' + func([$invalidatedKeys, key], key, src[key], context);
          $idxToKey[key] = newKey;
          setOnObject($out, newKey, src[key], $invalidates);
        }
      } else {
        const keysPendingDelete = new Set();
        $invalidatedKeys.forEach(key => keysPendingDelete.add($idxToKey[key]));
        $invalidatedKeys.forEach(key => {
          if (key < src.length) {
            const newKey = '' + func([$invalidatedKeys, key], key, src[key], context);
            keysPendingDelete.delete(newKey);
            $idxToKey[key] = newKey;
            setOnObject($out, newKey, src[key], $invalidates);
          }
        });
        keysPendingDelete.forEach(key => {
          deleteOnObject($out, key, $invalidates)
        });
      }
      $idxToKey.length = src.length;
      $invalidatedKeys.clear();
      return $out;
    }

    function mapKeysOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, emptyObj);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $keyToKey = $storage[4];
      if ($new) {
        Object.keys(src).forEach(key => {
          const newKey = func([$invalidatedKeys, key], key, src[key], context);
          setOnObject($out, newKey, src[key], $invalidates);
          $keyToKey[key] = newKey;
        });
      } else {
        const keysPendingDelete = new Set();
        $invalidatedKeys.forEach(key => {
          if ($keyToKey.hasOwnProperty(key)) {
            keysPendingDelete.add($keyToKey[key]);
            delete $keyToKey[key];
          }
        });
        $invalidatedKeys.forEach(key => {
          if (src.hasOwnProperty(key)) {
            const newKey = func([$invalidatedKeys, key], key, src[key], context);
            setOnObject($out, newKey, src[key], $invalidates);
            $keyToKey[key] = newKey;
            keysPendingDelete.delete(newKey);
          }
        });
        keysPendingDelete.forEach(key => {
          deleteOnObject($out, key, $invalidates);
        });
      }
      $invalidatedKeys.clear();
      return $out;
    }

    const filterCacheFunc = () => [0];

    function filterOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, filterCacheFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $idxToIdx = $storage[4];
      if ($new) {
        for (let key = 0; key < src.length; key++) {
          const passed = !!func([$invalidatedKeys, key], key, src[key], context);
          const prevItemIdx = $idxToIdx[key];
          const nextItemIdx = passed ? prevItemIdx + 1 : prevItemIdx;
          $idxToIdx[key + 1] = nextItemIdx;
          if (nextItemIdx !== prevItemIdx) {
            setOnArray($out, prevItemIdx, src[key], $invalidates);
          }
        }
      } else {
        let firstIndex = Number.MAX_SAFE_INTEGER;
        $invalidatedKeys.forEach(key => (firstIndex = Math.min(firstIndex, key)));
        for (let key = firstIndex; key < src.length; key++) {
          const passed = !!func([$invalidatedKeys, key], key, src[key], context);
          const prevItemIdx = $idxToIdx[key];
          const nextItemIdx = passed ? prevItemIdx + 1 : prevItemIdx;
          $idxToIdx[key + 1] = nextItemIdx;
          if (nextItemIdx !== prevItemIdx) {
            setOnArray($out, prevItemIdx, src[key], $invalidates);
          }
        }
        $idxToIdx.length = src.length + 1;
        truncateArray($out, $idxToIdx[$idxToIdx.length - 1], $invalidates);
      }
      $invalidatedKeys.clear();
      return $out;
    }

    function anyOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      // $out has at most 1 key - the one that stopped the previous run because it was truthy
      if ($new) {
        for (let key = 0; key < src.length; key++) {
          $invalidatedKeys.add(key);
        }
      }
      const $prevStop = $out.length > 0 ? $out[0] : -1;
      if ($prevStop >= 0 && $prevStop < src.length) {
        if ($invalidatedKeys.has($prevStop)) {
          $invalidatedKeys.delete($prevStop);
          const passedTest = func([$invalidatedKeys, $prevStop], $prevStop, src[$prevStop], context);
          if (passedTest) {
            return true;
          } else {
            $out.length = 0;
          }
        } else {
          return true;
        }
      }
      for (let key of $invalidatedKeys) {
        $invalidatedKeys.delete(key);
        if (key >= 0 && key < src.length && func([$invalidatedKeys, key], key, src[key], context)) {
          $out[0] = key;
          return true;
        }
      }
      return false;
    }


    function anyValuesOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      // $out has at most 1 key - the one that stopped the previous run because it was truthy
      if ($new) {
        Object.keys(src).forEach(key => $invalidatedKeys.add(key))
      }
      const $prevStop = $out.length > 0 ? $out[0] : null;
      if ($prevStop !== null && src.hasOwnProperty($prevStop)) {
        if ($invalidatedKeys.has($prevStop)) {
          $invalidatedKeys.delete($prevStop);
          const passedTest = func([$invalidatedKeys, $prevStop], $prevStop, src[$prevStop], context);
          if (passedTest) {
            return true;
          } else {
            $out.length = 0;
          }
        } else {
          return true;
        }
      }
      for (let key of $invalidatedKeys) {
        $invalidatedKeys.delete(key);
        if (src.hasOwnProperty(key) && func([$invalidatedKeys, key], key, src[key], context)) {
          $out[0] = key;
          return true;
        }
      }
      return false;
    }

    function groupByOpt($tracked, identifier, func, src, context, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, emptyObj);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const $keyToKey = $storage[4];
      if (Array.isArray(src)) {
        throw new Error('groupBy only works on objects');
      }
      if ($new) {
        Object.keys(src).forEach(key => {
          const res = '' + func([$invalidatedKeys, key], key, src[key], context);
          $keyToKey[key] = res;
          if (!$out[res]) {
            setOnObject($out, res, {}, $invalidates);
          }
          setOnObject($out[res], key, src[key], $invalidates);
        });
      } else {
        const keysPendingDelete = {};
        $invalidatedKeys.forEach(key => {
          if ($keyToKey[key]) {
            keysPendingDelete[$keyToKey[key]] = keysPendingDelete[$keyToKey[key]] || new Set();
            keysPendingDelete[$keyToKey[key]].add(key);
          }
        });
        $invalidatedKeys.forEach(key => {
          if (!src.hasOwnProperty(key)) {
            delete $keyToKey[key]
            return;
          }
          const res = '' + func([$invalidatedKeys, key], key, src[key], context);
          $keyToKey[key] = res;
          if (!$out[res]) {
            $out[res] = {};
          }
          setOnObject($out[res], key, src[key], $invalidates);
          setOnObject($out, res, $out[res], $invalidates);
          if (keysPendingDelete.hasOwnProperty(res)) {
            keysPendingDelete[res].delete(key);
          }
        });
        Object.keys(keysPendingDelete).forEach(res => {
          if (keysPendingDelete[res].size > 0) {
            keysPendingDelete[res].forEach(key => {
              deleteOnObject($out[res], key, $invalidates);
            });
            if (Object.keys($out[res]).length == 0) {
              deleteOnObject($out, res, $invalidates);
            } else {
              setOnObject($out, res, $out[res], $invalidates);
            }
          }
        });
      }
      $invalidatedKeys.clear();
      return $out;
    }

    const valuesOrKeysCacheFunc = () => ({$keyToIdx: {}, $idxToKey: []});

    function valuesOrKeysForObject($tracked, identifier, src, getValues, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, valuesOrKeysCacheFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      const { $keyToIdx, $idxToKey } = $storage[4];
      if ($new) {
        Object.keys(src).forEach((key, idx) => {
          $out[idx] = getValues ? src[key] : key;
          $idxToKey[idx] = key;
          $keyToIdx[key] = idx;
        });
      } else {
        const $deletedKeys = [];
        const $addedKeys = [];
        const $touchedKeys = [];
        $invalidatedKeys.forEach(key => {
          if (src.hasOwnProperty(key) && !$keyToIdx.hasOwnProperty(key)) {
            $addedKeys.push(key);
          } else if (!src.hasOwnProperty(key) && $keyToIdx.hasOwnProperty(key)) {
            $deletedKeys.push(key);
          } else {
            if ($keyToIdx.hasOwnProperty(key)) {
              setOnObject($out, $keyToIdx[key], getValues ? src[key] : key, $invalidates);
            }
          }
        });
        if ($addedKeys.length < $deletedKeys.length) {
          $deletedKeys.sort((a, b) => $keyToIdx[a] - $keyToIdx[b]);
        }
        const $finalOutLength = $out.length - $deletedKeys.length + $addedKeys.length;
        // keys both deleted and added fill created holes first
        for (let i = 0; i < $addedKeys.length && i < $deletedKeys.length; i++) {
          const $addedKey = $addedKeys[i];
          const $deletedKey = $deletedKeys[i];
          const $newIdx = $keyToIdx[$deletedKey];
          delete $keyToIdx[$deletedKey];
          $keyToIdx[$addedKey] = $newIdx;
          $idxToKey[$newIdx] = $addedKey;
          setOnArray($out, $newIdx, getValues ? src[$addedKey] : $addedKey, $invalidates)
        }
        // more keys added - append to end
        for (let i = $deletedKeys.length; i < $addedKeys.length; i++) {
          const $addedKey = $addedKeys[i];
          const $newIdx = $out.length;
          $keyToIdx[$addedKey] = $newIdx;
          $idxToKey[$newIdx] = $addedKey;
          setOnArray($out, $newIdx, getValues ? src[$addedKey] : $addedKey, $invalidates)
        }
        // more keys deleted - move non deleted items at the tail to the location of deleted
        const $deletedNotMoved = $deletedKeys.slice($addedKeys.length);
        const $deletedNotMovedSet = new Set($deletedKeys.slice($addedKeys.length));
        const $keysToMoveInside = new Set(
          $idxToKey.slice($finalOutLength).filter(key => !$deletedNotMovedSet.has(key))
        );
        let $savedCount = 0;
        for (let $tailIdx = $finalOutLength; $tailIdx < $out.length; $tailIdx++) {
          const $currentKey = $idxToKey[$tailIdx];
          if ($keysToMoveInside.has($currentKey)) {
            // need to move this key to one of the pending delete
            const $switchedWithDeletedKey = $deletedNotMoved[$savedCount];
            const $newIdx = $keyToIdx[$switchedWithDeletedKey];
            setOnArray($out, $newIdx, getValues ? src[$currentKey] : $currentKey, $invalidates);
            $keyToIdx[$currentKey] = $newIdx;
            $idxToKey[$newIdx] = $currentKey;
            delete $keyToIdx[$switchedWithDeletedKey];
            $savedCount++;
          } else {
            delete $keyToIdx[$currentKey];
          }
        }
        truncateArray($out, $finalOutLength, $invalidates);
        $idxToKey.length = $out.length;
        $invalidatedKeys.clear();
      }
      return $out;
    }

    function getEmptyArray($tracked, token) {
      const subKeys = $tracked[0].$subKeys;
      const $cachePerTargetKey = subKeys[$tracked[1]] = subKeys[$tracked[1]] || new Map();
      if (!$cachePerTargetKey.has(token)) {
        $cachePerTargetKey.set(token, []);
      }
      return $cachePerTargetKey.get(token);
    }

    function getEmptyObject($tracked, token) {
      const subKeys = $tracked[0].$subKeys;
      const $cachePerTargetKey = subKeys[$tracked[1]] = subKeys[$tracked[1]] || new Map();
      if (!$cachePerTargetKey.has(token)) {
        $cachePerTargetKey.set(token, {});
      }
      return $cachePerTargetKey.get(token);
    }

    function array($tracked, newVal, identifier, len, $invalidates) {
      const res = getEmptyArray($tracked, identifier);
      $invalidates = $invalidates && res.length === len;
      for (let i = 0; i < len; i++) {
        setOnArray(res, i, newVal[i], $invalidates);
      }
      return res;
    }

    function object($tracked, newVal, identifier, keysList, $invalidates) {
      const res = getEmptyObject($tracked, identifier);
      $invalidates = $invalidates && keysList.length && res.hasOwnProperty(keysList[0]);
      for (let i = 0; i < keysList.length; i++) {
        const name = keysList[i];
        setOnObject(res, name, newVal[i], $invalidates);
      }
      return res;
    }

    function call($tracked, newVal, identifier, len, $invalidates) {
      const arr = getEmptyArray($tracked, identifier);
      if (arr.length === 0) {
        arr.push([]);
      }
      const args = arr[0];
      for (let i = 0; i < len; i++) {
        setOnArray(args, i, newVal[i], true);
      }
      if (arr.length === 1 || $tainted.has(args)) {
        arr[1] = $funcLib[args[0]].apply($res, args.slice(1));
      }
      return arr[1];
    }

    function bind($tracked, newVal, identifier, len) {
      const arr = getEmptyArray($tracked, identifier);
      if (arr.length === 0) {
        arr.push([]);
      }
      const args = arr[0];
      for (let i = 0; i < len; i++) {
        args[i] = newVal[i];
      }
      if (arr.length === 1) {
        arr[1] = (...extraArgs) => {
          const fn = $funcLibRaw[args[0]] || $res[args[0]];
          return fn.apply($res, args.slice(1).concat(extraArgs));
        };
      }
      return arr[1]
    }

    function assignOrDefaults($tracked, identifier, src, assign, $invalidates) {
      const $storage = initOutput($tracked, src, identifier, emptyObj, nullFunc);
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2];
      const $new = $storage[3];
      if (!assign) {
        src = [...src].reverse();
      }
      if ($new) {
        Object.assign($out, ...src);
      } else {
        const $keysPendingDelete = new Set(Object.keys($out));
        const res = Object.assign({}, ...src);
        Object.keys(res).forEach(key => {
          $keysPendingDelete.delete(key);
          setOnObject($out, key, res[key], $invalidates);
        });
        $keysPendingDelete.forEach(key => {
          deleteOnObject($out, key, $invalidates)
        });
        $invalidatedKeys.clear();
      }
      return $out;
    }

    function flatten($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, emptyArr)
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2]
      const $new = $storage[3]
      const $cache = $storage[4]
      const length = src.length
      const initialLength = $out.length
      if($new) {
        for(let pos=0, i=0;i<length;i+=1) {
          $cache[i] = src[i].length
          for(let j=0;j<$cache[i];j+=1) {
            $out[pos+j] = src[i][j]
          }
          pos += $cache[i]
        }
      } else {
        let pos=0
        for(let key=0;key<length;key+=1) {
          let partLen = src[key].length
          if($invalidatedKeys.has(key)) {
            if($cache[key] && $cache[key] == partLen) {
              src[key].forEach((value, index) => setOnArray($out, pos+index, value, true))
              pos += $cache[key]
            } else {
              for(;key<length;key+=1) {
                partLen = src[key].length
                src[key].forEach((value, index) => setOnArray($out, pos+index, value, true))
                $cache[key] = partLen
                pos += partLen
              }
            }
          } else {
            pos += partLen
          }
        }
        $invalidatedKeys.clear()

        initialLength !== pos && truncateArray($out, pos, true)
      }

      return $out
    }

    function size($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, nullFunc)
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2]
      const $new = $storage[3]
      if ($new) {
        $out[0] = Array.isArray(src) ? src.length : Object.keys(src).length
      }
      if (!$new) {
        $out[0] = Array.isArray(src) ? src.length : Object.keys(src).length
        $invalidatedKeys.clear()
      }
      return $out[0]
    }

    function sum($tracked, src, identifier) {
      const $storage = initOutput($tracked, src, identifier, emptyArr, emptyArr)
      const $out = $storage[1]
      const $invalidatedKeys = $storage[2]
      const $new = $storage[3]
      const $cache = $storage[4]
      const length = src.length
      if($new) {
        $cache[0] = 0
        $cache[1] = []
        for(let i = 0;i<length;i++) {
          $cache[0] += src[i]
          $cache[1][i] = src[i]
        }
      } else {
        $invalidatedKeys.forEach((key) => {
          const cached = $cache[1][key] || 0
          const live = src[key] || 0
          $cache[0] = $cache[0] - cached + live
          $cache[1][key] = live
        })
        $cache[1].length = length
        $invalidatedKeys.clear()
      }
      $out[0] = $cache[0]
      return $out[0]
    }

    function range($tracked, end, start, step, identifier, $invalidates) {
      const $out = getEmptyArray($tracked, identifier);
      let $res;
      if ($out.length === 0) {
        $res = [];
        $out.push($res);
        for (let val = start; (step > 0 && val < end) || (step < 0 && val > end); val += step) {
          $res.push(val);
        }
      } else {
        let len = 0;
        $res = $out[0];
        for (let val = start; (step > 0 && val < end) || (step < 0 && val > end); val += step) {
          setOnArray($res, len, val, $invalidates);
          len++;
        }
        if ($res.length > len) {
          truncateArray($res, len, $invalidates);
        }
      }
      return $res;
    }

    function invalidatePath(path) {
        path.forEach((part, index) => {
          triggerInvalidations(getAssignableObject(path, index), part, index === path.length - 1)
        })
    }

    function set(path, value) {
      ensurePath(path)
      invalidatePath(path)
      applySetter(getAssignableObject(path, path.length - 1), path[path.length - 1], value)
    }

    function splice(pathWithKey, len, ...newItems) {
      ensurePath(pathWithKey)
      const key = pathWithKey[pathWithKey.length - 1]
      const path = pathWithKey.slice(0, pathWithKey.length - 1)
      const arr = getAssignableObject(path, path.length)
      const origLength = arr.length;
      const end = len === newItems.length ? key + len : Math.max(origLength, origLength + newItems.length - len);
      for (let i = key; i < end; i++ ) {
        triggerInvalidations(arr, i, true);
      }
      invalidatePath(pathWithKey)
      arr.splice(key, len, ...newItems)
    }
  
    
    const $topLevel = new Array(3).fill(null);
    function $todosBuild($tracked) {
    
    
    const newValue = $model["todos"];
    
    return newValue
  }

function doneTasks($tracked, key, val, context) {
    
    const res = val["done"];
    
    return res;
  }

function $doneTasksBuild($tracked) {
    
    checkTypes($topLevel[0 /*"todos"*/], 'doneTasks', ["object"], 'filterBy', 'todos/todosCarmi.js:3:25')
    const newValue = filterByOpt($tracked, '1', doneTasks, $topLevel[0 /*"todos"*/], null, false);
    
    return newValue
  }

function pendingTodos$5($tracked, key, val, context) {
    
    const res = !(val["done"]);
    
    return res;
  }

function $pendingTodosBuild($tracked) {
    
    checkTypes($topLevel[0 /*"todos"*/], 'pendingTodos', ["object"], 'filterBy', 'todos/todosCarmi.js:4:28')
    const newValue = filterByOpt($tracked, '5', pendingTodos$5, $topLevel[0 /*"todos"*/], null, false);
    
    return newValue
  }

    const builderFunctions = [$todosBuild,$doneTasksBuild,$pendingTodosBuild];
  const builderNames = ["todos","doneTasks","pendingTodos"];
  function updateDerived() {
    for (let i = 0; i < 3; i++) {
      if ($first || $invalidatedRoots.has(i)) {
        const newValue = builderFunctions[i]([$invalidatedRoots, i]);
        setOnArray($topLevel, i, newValue, true);
        if (!$first) {
          $invalidatedRoots.delete(i);
        }
        if (builderNames[i]) {
          $res[builderNames[i]] = newValue;
        }
      }
    }
  }


    let $inBatch = false;
    let $batchPending = [];
    let $inRecalculate = false;

    function recalculate() {
      if ($inBatch) {
        return;
      }
      $inRecalculate = true;
      updateDerived()
      $first = false;
$tainted = new WeakSet();

      $listeners.forEach(callback => callback());
      $inRecalculate = false;
      if ($batchPending.length) {
        $res.$endBatch();
      }
    }

    function ensurePath(path) {
      if (path.length < 2) {
        return
      }

      if (path.length > 2) {
        ensurePath(path.slice(0, path.length - 1))
      }

      const lastObjectKey = path[path.length - 2]

      const assignable = getAssignableObject(path, path.length - 2)
      if (assignable[lastObjectKey]) {
        return
      }
      const lastType = typeof path[path.length - 1]
      assignable[lastObjectKey] = lastType === 'number' ? [] : {}
    }

    function getAssignableObject(path, index) {
      return path.slice(0, index).reduce((agg, p) => agg[p], $model)
    }

    function push(path, value) {
      ensurePath([...path, 0])
      const arr = getAssignableObject(path, path.length)
      splice([...path, arr.length], 0, value)
    }

    function applySetter(object, key, value) {
      if (typeof value === 'undefined') {
        delete object[key]
      } else {
        object[key] = value;
      }
    }

    function $setter(func, ...args) {
      if ($inBatch || $inRecalculate || $batchingStrategy) {
        $batchPending.push({ func, args });
        if ((!$inBatch && !$inRecalculate) && $batchingStrategy) {
          $inBatch = true;
          $batchingStrategy.call($res);
        }
      } else {
        func.apply($res, args);
        recalculate();
      }
    }

    Object.assign(
      $res,
      {},
      {
        $startBatch: () => {
          $inBatch = true;
        },
        $endBatch: () => {
          $inBatch = false;
          if ($batchPending.length) {
            $batchPending.forEach(({ func, args }) => {
              func.apply($res, args);
            });
            $batchPending = [];
            recalculate();
          }
        },
        $runInBatch: func => {
          $res.$startBatch();
          func();
          $res.$endBatch();
        },
        $addListener: func => {
          $listeners.add(func);
        },
        $removeListener: func => {
          $listeners.delete(func);
        },
        $setBatchingStrategy: func => {
          $batchingStrategy = func;
        }
      }
    );

    if (/* DEBUG */true) {
      Object.assign($res, {
        $ast: () => { return {
  "todos": [
    "*get*",
    "todos",
    "*root*"
  ],
  "doneTasks": [
    "*filterBy*",
    [
      "*func*",
      [
        "*get*",
        "done",
        "*val*"
      ]
    ],
    [
      "*get*",
      "todos",
      "*topLevel*"
    ]
  ],
  "pendingTodos": [
    "*filterBy*",
    [
      "*func*",
      [
        "*not*",
        [
          "*get*",
          "done",
          "*val*"
        ]
      ]
    ],
    [
      "*get*",
      "todos",
      "*topLevel*"
    ]
  ]
} },
        $source: () => null
      })
    }
    recalculate();
    return $res;
  }

        }())
