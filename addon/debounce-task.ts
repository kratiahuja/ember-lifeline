import EmberObject from '@ember/object';
import { debounce, cancel } from '@ember/runloop';
import { assert } from '@ember/debug';
import { registerDisposable } from './utils/disposable';
import { IMap } from './interfaces';

type PendingDebounce =
  | {
      debouncedTask: Function;
      cancelId: EmberRunTimer;
    }
  | undefined;

/**
 * A map of instances/debounce functions that allows us to
 * store pending debounces per instance.
 *
 * @private
 *
 */
const registeredDebounces: IMap<Object, Object> = new WeakMap<Object, any>();

/**
   Runs the function with the provided name after the timeout has expired on the last
   invocation. The timer is properly canceled if the object is destroyed before it is
   invoked.

   Example:

   ```js
   import Component from 'ember-component';
   import { debounceTask, runDisposables } from 'ember-lifeline';

   export default Component.extend({
     logMe() {
       console.log('This will only run once every 300ms.');
     },

     click() {
       debounceTask(this, 'logMe', 300);
     },

     destroy() {
       runDisposables(this);
     }
   });
   ```

   @method debounceTask
   @param { Object } obj the instance to register the task for
   @param { String } name the name of the task to debounce
   @param { ...* } debounceArgs arguments to pass to the debounced method
   @param { Number } wait the amount of time to wait before calling the method (in milliseconds)
   @public
   */
export function debounceTask(
  obj: EmberObject,
  name: string,
  ...debounceArgs: any[]
): void | undefined {
  assert(
    `Called \`debounceTask\` without a string as the first argument on ${obj}.`,
    typeof name === 'string'
  );
  assert(
    `Called \`obj.debounceTask('${name}', ...)\` where 'obj.${name}' is not a function.`,
    typeof obj[name] === 'function'
  );
  assert(
    `Called \`debounceTask\` on destroyed object: ${obj}.`,
    !obj.isDestroyed
  );

  let pendingDebounces: Object = registeredDebounces.get(obj);
  if (!pendingDebounces) {
    pendingDebounces = new Map();
    registeredDebounces.set(obj, pendingDebounces);
    registerDisposable(obj, getDebouncesDisposable(pendingDebounces));
  }

  let pendingDebounce: PendingDebounce = pendingDebounces[name];
  let debouncedTask: Function;

  if (!pendingDebounce) {
    debouncedTask = (...args) => {
      delete pendingDebounces[name];
      obj[name](...args);
    };
  } else {
    debouncedTask = pendingDebounce.debouncedTask;
  }

  // cancelId is new, even if the debounced function was already present
  let cancelId = debounce(obj as any, debouncedTask as any, ...debounceArgs);

  pendingDebounces[name] = { debouncedTask, cancelId };
}

/**
   Cancel a previously debounced task.

   Example:

   ```js
   import Component from 'ember-component';
   import { debounceTask, cancelDebounce } from 'ember-lifeline';

   export default Component.extend({
     logMe() {
       console.log('This will only run once every 300ms.');
     },

     click() {
       debounceTask(this, 'logMe', 300);
     },

     disable() {
        cancelDebounce(this, 'logMe');
     },

     destroy() {
       runDisposables(this);
     }
   });
   ```

   @method cancelDebounce
   @param { Object } obj the instance to register the task for
   @param { String } methodName the name of the debounced method to cancel
   @public
   */
export function cancelDebounce(
  obj: EmberObject,
  name: string
): void | undefined {
  let pendingDebounces: Object = registeredDebounces.get(obj);

  if (pendingDebounces === undefined || pendingDebounces[name] === undefined) {
    return;
  }

  let { cancelId } = pendingDebounces[name];

  delete pendingDebounces[name];
  cancel(cancelId);
}

function getDebouncesDisposable(debounces: Object): Function {
  return function() {
    let debounceNames = debounces && Object.keys(debounces);

    if (!debounceNames || !debounceNames.length) {
      return;
    }

    for (let i = 0; i < debounceNames.length; i++) {
      let { cancelId } = debounces[debounceNames[i]];

      cancel(cancelId);
    }
  };
}
