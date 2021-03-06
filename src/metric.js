function cubism_metric(context) {
  if (!(context instanceof cubism_context)) throw new Error("invalid context");
  this.context = context;
}

var cubism_metricPrototype = cubism_metric.prototype;

cubism.metric = cubism_metric;

cubism_metricPrototype.valueAt = function() {
  return NaN;
};

cubism_metricPrototype.alias = function(name) {
  this.toString = function() { return name; };
  return this;
};

cubism_metricPrototype.extent = function() {
  var i = 0,
      n = this.context.size(),
      value,
      min = Infinity,
      max = -Infinity;
  while (++i < n) {
    value = this.valueAt(i);
    if (value < min) min = value;
    if (value > max) max = value;
  }
  return [min, max];
};

cubism_metricPrototype.on = function(type, listener) {
  return arguments.length < 2 ? null : this;
};

cubism_metricPrototype.shift = function() {
  return this;
};

cubism_metricPrototype.on = function() {
  return arguments.length < 2 ? null : this;
};

cubism_contextPrototype.metric = function(request, name) {
  var context = this,
      metric = new cubism_metric(context),
      id = ".metric-" + ++cubism_id,
      start = -Infinity,
      stop,
      step = context.step(),
      size = context.size(),
      values = [],
      event = d3.dispatch("change"),
      listening = 0,
      fetching;

  // Prefetch new data into a temporary array.
  function prepare(start1, stop, callback) {
    if(start1 > start) {
      var steps = Math.min(size, Math.round((start1 - start) / step));
      if (!steps || fetching) return; // already fetched, or fetching!
      fetching = true;
      steps = Math.min(size, steps + cubism_metricOverlap);
      var start0 = new Date(stop - steps * step);
      var lastVal = values.slice(-steps)[0];
      request(start0, stop, step, lastVal, function(error, data) {
        fetching = false;
        if (error) return console.warn(error);
        var i = isFinite(start) ? Math.round((start0 - start) / step) : 0;
        for (var j = 0, m = data.length; j < m; ++j) values[j + i] = data[j];
        event.change.call(metric, start, stop);
        if(callback != null) callback();
      });
    } else {
      var steps = Math.min(size, Math.round((stop - start1) / step));
      if (!steps || fetching) return;
      fetching = true;
      var stop0 = new Date(+start1 + steps * step);
      var lastVal = values.slice(-1)[0];
      request(start1, stop0, step, lastVal, function(error, data) {
        fetching = false;
        if(error) return console.warn(error);
        prevalues = []
        for (var j = 0, m = data.length; j < m; ++j) prevalues[j] = data[j];
        values = prevalues.concat(values);
        event.change.call(metric, start, stop);
        if(callback != null) callback();
      });
    }
  }

  // When the context changes, switch to the new data, ready-or-not!
  function beforechange(start1, stop1) {
    if (!isFinite(start)) start = start1;

    if(start1 > start) {
      values.splice(0, Math.max(0, Math.min(size, Math.round((start1 - start) / step))));
    } else {
      values.splice(size, size);
    }
    start = start1;
    stop = stop1;
  }

  //
  metric.valueAt = function(i) {
    return values[i];
  };

  //
  metric.shift = function(offset) {
    return context.metric(cubism_metricShift(request, +offset));
  };

  //
  metric.on = function(type, listener) {
    if (!arguments.length) return event.on(type);

    // If there are no listeners, then stop listening to the context,
    // and avoid unnecessary fetches.
    if (listener == null) {
      if (event.on(type) != null && --listening == 0) {
        context.on("prepare" + id, null).on("beforechange" + id, null);
      }
    } else {
      if (event.on(type) == null && ++listening == 1) {
        context.on("prepare" + id, prepare).on("beforechange" + id, beforechange);
      }
    }

    event.on(type, listener);

    // Notify the listener of the current start and stop time, as appropriate.
    // This way, charts can display synchronous metrics immediately.
    if (listener != null) {
      if (/^change(\.|$)/.test(type)) listener.call(context, start, stop);
    }

    return metric;
  };

  //
  if (arguments.length > 1) metric.toString = function() {
    return name;
  };

  return metric;
};

// Number of metric to refetch each period, in case of lag.
var cubism_metricOverlap = 6;

// Wraps the specified request implementation, and shifts time by the given offset.
function cubism_metricShift(request, offset) {
  return function(start, stop, step, callback) {
    request(new Date(+start + offset), new Date(+stop + offset), step, callback);
  };
}
