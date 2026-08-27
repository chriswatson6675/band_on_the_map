/*! jQuery v3.3.1 | (c) JS Foundation and other contributors | jquery.org/license */
!(function (e, t) {
  "use strict";
  "object" == typeof module && "object" == typeof module.exports
    ? (module.exports = e.document
        ? t(e, !0)
        : function (e) {
            if (!e.document)
              throw new Error("jQuery requires a window with a document");
            return t(e);
          })
    : t(e);
})("undefined" != typeof window ? window : this, function (e, t) {
  "use strict";
  var n = [],
    r = e.document,
    i = Object.getPrototypeOf,
    o = n.slice,
    a = n.concat,
    s = n.push,
    u = n.indexOf,
    l = {},
    c = l.toString,
    f = l.hasOwnProperty,
    p = f.toString,
    d = p.call(Object),
    h = {},
    g = function e(t) {
      return "function" == typeof t && "number" != typeof t.nodeType;
    },
    y = function e(t) {
      return null != t && t === t.window;
    },
    v = { type: !0, src: !0, noModule: !0 };
  function m(e, t, n) {
    var i,
      o = (t = t || r).createElement("script");
    if (((o.text = e), n)) for (i in v) n[i] && (o[i] = n[i]);
    t.head.appendChild(o).parentNode.removeChild(o);
  }
  function x(e) {
    return null == e
      ? e + ""
      : "object" == typeof e || "function" == typeof e
        ? l[c.call(e)] || "object"
        : typeof e;
  }
  var b = "3.3.1",
    w = function (e, t) {
      return new w.fn.init(e, t);
    },
    T = /^[\s\uFEFF\xA0]+|[\s\uFEFF\xA0]+$/g;
  (w.fn = w.prototype =
    {
      jquery: "3.3.1",
      constructor: w,
      length: 0,
      toArray: function () {
        return o.call(this);
      },
      get: function (e) {
        return null == e
          ? o.call(this)
          : e < 0
            ? this[e + this.length]
            : this[e];
      },
      pushStack: function (e) {
        var t = w.merge(this.constructor(), e);
        return (t.prevObject = this), t;
      },
      each: function (e) {
        return w.each(this, e);
      },
      map: function (e) {
        return this.pushStack(
          w.map(this, function (t, n) {
            return e.call(t, n, t);
          })
        );
      },
      slice: function () {
        return this.pushStack(o.apply(this, arguments));
      },
      first: function () {
        return this.eq(0);
      },
      last: function () {
        return this.eq(-1);
      },
      eq: function (e) {
        var t = this.length,
          n = +e + (e < 0 ? t : 0);
        return this.pushStack(n >= 0 && n < t ? [this[n]] : []);
      },
      end: function () {
        return this.prevObject || this.constructor();
      },
      push: s,
      sort: n.sort,
      splice: n.splice,
    }),
    (w.extend = w.fn.extend =
      function () {
        var e,
          t,
          n,
          r,
          i,
          o,
          a = arguments[0] || {},
          s = 1,
          u = arguments.length,
          l = !1;
        for (
          "boolean" == typeof a && ((l = a), (a = arguments[s] || {}), s++),
            "object" == typeof a || g(a) || (a = {}),
            s === u && ((a = this), s--);
          s < u;
          s++
        )
          if (null != (e = arguments[s]))
            for (t in e)
              (n = a[t]),
                a !== (r = e[t]) &&
                  (l && r && (w.isPlainObject(r) || (i = Array.isArray(r)))
                    ? (i
                        ? ((i = !1), (o = n && Array.isArray(n) ? n : []))
                        : (o = n && w.isPlainObject(n) ? n : {}),
                      (a[t] = w.extend(l, o, r)))
                    : void 0 !== r && (a[t] = r));
        return a;
      }),
    w.extend({
      expando: "jQuery" + ("3.3.1" + Math.random()).replace(/\D/g, ""),
      isReady: !0,
      error: function (e) {
        throw new Error(e);
      },
      noop: function () {},
      isPlainObject: function (e) {
        var t, n;
        return (
          !(!e || "[object Object]" !== c.call(e)) &&
          (!(t = i(e)) ||
            ("function" ==
              typeof (n = f.call(t, "constructor") && t.constructor) &&
              p.call(n) === d))
        );
      },
      isEmptyObject: function (e) {
        var t;
        for (t in e) return !1;
        return !0;
      },
      globalEval: function (e) {
        m(e);
      },
      each: function (e, t) {
        var n,
          r = 0;
        if (C(e)) {
          for (n = e.length; r < n; r++)
            if (!1 === t.call(e[r], r, e[r])) break;
        } else for (r in e) if (!1 === t.call(e[r], r, e[r])) break;
        return e;
      },
      trim: function (e) {
        return null == e ? "" : (e + "").replace(T, "");
      },
      makeArray: function (e, t) {
        var n = t || [];
        return (
          null != e &&
            (C(Object(e))
              ? w.merge(n, "string" == typeof e ? [e] : e)
              : s.call(n, e)),
          n
        );
      },
      inArray: function (e, t, n) {
        return null == t ? -1 : u.call(t, e, n);
      },
      merge: function (e, t) {
        for (var n = +t.length, r = 0, i = e.length; r < n; r++) e[i++] = t[r];
        return (e.length = i), e;
      },
      grep: function (e, t, n) {
        for (var r, i = [], o = 0, a = e.length, s = !n; o < a; o++)
          (r = !t(e[o], o)) !== s && i.push(e[o]);
        return i;
      },
      map: function (e, t, n) {
        var r,
          i,
          o = 0,
          s = [];
        if (C(e))
          for (r = e.length; o < r; o++)
            null != (i = t(e[o], o, n)) && s.push(i);
        else for (o in e) null != (i = t(e[o], o, n)) && s.push(i);
        return a.apply([], s);
      },
      guid: 1,
      support: h,
    }),
    "function" == typeof Symbol && (w.fn[Symbol.iterator] = n[Symbol.iterator]),
    w.each(
      "Boolean Number String Function Array Date RegExp Object Error Symbol".split(
        " "
      ),
      function (e, t) {
        l["[object " + t + "]"] = t.toLowerCase();
      }
    );
  function C(e) {
    var t = !!e && "length" in e && e.length,
      n = x(e);
    return (
      !g(e) &&
      !y(e) &&
      ("array" === n ||
        0 === t ||
        ("number" == typeof t && t > 0 && t - 1 in e))
    );
  }
  var E = (function (e) {
    var t,
      n,
      r,
      i,
      o,
      a,
      s,
      u,
      l,
      c,
      f,
      p,
      d,
      h,
      g,
      y,
      v,
      m,
      x,
      b = "sizzle" + 1 * new Date(),
      w = e.document,
      T = 0,
      C = 0,
      E = ae(),
      k = ae(),
      S = ae(),
      D = function (e, t) {
        return e === t && (f = !0), 0;
      },
      N = {}.hasOwnProperty,
      A = [],
      j = A.pop,
      q = A.push,
      L = A.push,
      H = A.slice,
      O = function (e, t) {
        for (var n = 0, r = e.length; n < r; n++) if (e[n] === t) return n;
        return -1;
      },
      P =
        "checked|selected|async|autofocus|autoplay|controls|defer|disabled|hidden|ismap|loop|multiple|open|readonly|required|scoped",
      M = "[\\x20\\t\\r\\n\\f]",
      R = "(?:\\\\.|[\\w-]|[^\0-\\xa0])+",
      I =
        "\\[" +
        M +
        "*(" +
        R +
        ")(?:" +
        M +
        "*([*^$|!~]?=)" +
        M +
        "*(?:'((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\"|(" +
        R +
        "))|)" +
        M +
        "*\\]",
      W =
        ":(" +
        R +
        ")(?:\\((('((?:\\\\.|[^\\\\'])*)'|\"((?:\\\\.|[^\\\\\"])*)\")|((?:\\\\.|[^\\\\()[\\]]|" +
        I +
        ")*)|.*)\\)|)",
      $ = new RegExp(M + "+", "g"),
      B = new RegExp("^" + M + "+|((?:^|[^\\\\])(?:\\\\.)*)" + M + "+$", "g"),
      F = new RegExp("^" + M + "*," + M + "*"),
      _ = new RegExp("^" + M + "*([>+~]|" + M + ")" + M + "*"),
      z = new RegExp("=" + M + "*([^\\]'\"]*?)" + M + "*\\]", "g"),
      X = new RegExp(W),
      U = new RegExp("^" + R + "$"),
      V = {
        ID: new RegExp("^#(" + R + ")"),
        CLASS: new RegExp("^\\.(" + R + ")"),
        TAG: new RegExp("^(" + R + "|[*])"),
        ATTR: new RegExp("^" + I),
        PSEUDO: new RegExp("^" + W),
        CHILD: new RegExp(
          "^:(only|first|last|nth|nth-last)-(child|of-type)(?:\\(" +
            M +
            "*(even|odd|(([+-]|)(\\d*)n|)" +
            M +
            "*(?:([+-]|)" +
            M +
            "*(\\d+)|))" +
            M +
            "*\\)|)",
          "i"
        ),
        bool: new RegExp("^(?:" + P + ")$", "i"),
        needsContext: new RegExp(
          "^" +
            M +
            "*[>+~]|:(even|odd|eq|gt|lt|nth|first|last)(?:\\(" +
            M +
            "*((?:-\\d)?\\d*)" +
            M +
            "*\\)|)(?=[^-]|$)",
          "i"
        ),
      },
      G = /^(?:input|select|textarea|button)$/i,
      Y = /^h\d$/i,
      Q = /^[^{]+\{\s*\[native \w/,
      J = /^(?:#([\w-]+)|(\w+)|\.([\w-]+))$/,
      K = /[+~]/,
      Z = new RegExp("\\\\([\\da-f]{1,6}" + M + "?|(" + M + ")|.)", "ig"),
      ee = function (e, t, n) {
        var r = "0x" + t - 65536;
        return r !== r || n
          ? t
          : r < 0
            ? String.fromCharCode(r + 65536)
            : String.fromCharCode((r >> 10) | 55296, (1023 & r) | 56320);
      },
      te = /([\0-\x1f\x7f]|^-?\d)|^-$|[^\0-\x1f\x7f-\uFFFF\w-]/g,
      ne = function (e, t) {
        return t
          ? "\0" === e
            ? "\ufffd"
            : e.slice(0, -1) +
              "\\" +
              e.charCodeAt(e.length - 1).toString(16) +
              " "
          : "\\" + e;
      },
      re = function () {
        p();
      },
      ie = me(
        function (e) {
          return !0 === e.disabled && ("form" in e || "label" in e);
        },
        { dir: "parentNode", next: "legend" }
      );
    try {
      L.apply((A = H.call(w.childNodes)), w.childNodes),
        A[w.childNodes.length].nodeType;
    } catch (e) {
      L = {
        apply: A.length
          ? function (e, t) {
              q.apply(e, H.call(t));
            }
          : function (e, t) {
              var n = e.length,
                r = 0;
              while ((e[n++] = t[r++]));
              e.length = n - 1;
            },
      };
    }
    function oe(e, t, r, i) {
      var o,
        s,
        l,
        c,
        f,
        h,
        v,
        m = t && t.ownerDocument,
        T = t ? t.nodeType : 9;
      if (
        ((r = r || []),
        "string" != typeof e || !e || (1 !== T && 9 !== T && 11 !== T))
      )
        return r;
      if (
        !i &&
        ((t ? t.ownerDocument || t : w) !== d && p(t), (t = t || d), g)
      ) {
        if (11 !== T && (f = J.exec(e)))
          if ((o = f[1])) {
            if (9 === T) {
              if (!(l = t.getElementById(o))) return r;
              if (l.id === o) return r.push(l), r;
            } else if (m && (l = m.getElementById(o)) && x(t, l) && l.id === o)
              return r.push(l), r;
          } else {
            if (f[2]) return L.apply(r, t.getElementsByTagName(e)), r;
            if (
              (o = f[3]) &&
              n.getElementsByClassName &&
              t.getElementsByClassName
            )
              return L.apply(r, t.getElementsByClassName(o)), r;
          }
        if (n.qsa && !S[e + " "] && (!y || !y.test(e))) {
          if (1 !== T) (m = t), (v = e);
          else if ("object" !== t.nodeName.toLowerCase()) {
            (c = t.getAttribute("id"))
              ? (c = c.replace(te, ne))
              : t.setAttribute("id", (c = b)),
              (s = (h = a(e)).length);
            while (s--) h[s] = "#" + c + " " + ve(h[s]);
            (v = h.join(",")), (m = (K.test(e) && ge(t.parentNode)) || t);
          }
          if (v)
            try {
              return L.apply(r, m.querySelectorAll(v)), r;
            } catch (e) {
            } finally {
              c === b && t.removeAttribute("id");
            }
        }
      }
      return u(e.replace(B, "$1"), t, r, i);
    }
    function ae() {
      var e = [];
      function t(n, i) {
        return (
          e.push(n + " ") > r.cacheLength && delete t[e.shift()],
          (t[n + " "] = i)
        );
      }
      return t;
    }
    function se(e) {
      return (e[b] = !0), e;
    }
    function ue(e) {
      var t = d.createElement("fieldset");
      try {
        return !!e(t);
      } catch (e) {
        return !1;
      } finally {
        t.parentNode && t.parentNode.removeChild(t), (t = null);
      }
    }
    function le(e, t) {
      var n = e.split("|"),
        i = n.length;
      while (i--) r.attrHandle[n[i]] = t;
    }
    function ce(e, t) {
      var n = t && e,
        r =
          n &&
          1 === e.nodeType &&
          1 === t.nodeType &&
          e.sourceIndex - t.sourceIndex;
      if (r) return r;
      if (n) while ((n = n.nextSibling)) if (n === t) return -1;
      return e ? 1 : -1;
    }
    function fe(e) {
      return function (t) {
        return "input" === t.nodeName.toLowerCase() && t.type === e;
      };
    }
    function pe(e) {
      return function (t) {
        var n = t.nodeName.toLowerCase();
        return ("input" === n || "button" === n) && t.type === e;
      };
    }
    function de(e) {
      return function (t) {
        return "form" in t
          ? t.parentNode && !1 === t.disabled
            ? "label" in t
              ? "label" in t.parentNode
                ? t.parentNode.disabled === e
                : t.disabled === e
              : t.isDisabled === e || (t.isDisabled !== !e && ie(t) === e)
            : t.disabled === e
          : "label" in t && t.disabled === e;
      };
    }
    function he(e) {
      return se(function (t) {
        return (
          (t = +t),
          se(function (n, r) {
            var i,
              o = e([], n.length, t),
              a = o.length;
            while (a--) n[(i = o[a])] && (n[i] = !(r[i] = n[i]));
          })
        );
      });
    }
    function ge(e) {
      return e && "undefined" != typeof e.getElementsByTagName && e;
    }
    (n = oe.support = {}),
      (o = oe.isXML =
        function (e) {
          var t = e && (e.ownerDocument || e).documentElement;
          return !!t && "HTML" !== t.nodeName;
        }),
      (p = oe.setDocument =
        function (e) {
          var t,
            i,
            a = e ? e.ownerDocument || e : w;
          return a !== d && 9 === a.nodeType && a.documentElement
            ? ((d = a),
              (h = d.documentElement),
              (g = !o(d)),
              w !== d &&
                (i = d.defaultView) &&
                i.top !== i &&
                (i.addEventListener
                  ? i.addEventListener("unload", re, !1)
                  : i.attachEvent && i.attachEvent("onunload", re)),
              (n.attributes = ue(function (e) {
                return (e.className = "i"), !e.getAttribute("className");
              })),
              (n.getElementsByTagName = ue(function (e) {
                return (
                  e.appendChild(d.createComment("")),
                  !e.getElementsByTagName("*").length
                );
              })),
              (n.getElementsByClassName = Q.test(d.getElementsByClassName)),
              (n.getById = ue(function (e) {
                return (
                  (h.appendChild(e).id = b),
                  !d.getElementsByName || !d.getElementsByName(b).length
                );
              })),
              n.getById
                ? ((r.filter.ID = function (e) {
                    var t = e.replace(Z, ee);
                    return function (e) {
                      return e.getAttribute("id") === t;
                    };
                  }),
                  (r.find.ID = function (e, t) {
                    if ("undefined" != typeof t.getElementById && g) {
                      var n = t.getElementById(e);
                      return n ? [n] : [];
                    }
                  }))
                : ((r.filter.ID = function (e) {
                    var t = e.replace(Z, ee);
                    return function (e) {
                      var n =
                        "undefined" != typeof e.getAttributeNode &&
                        e.getAttributeNode("id");
                      return n && n.value === t;
                    };
                  }),
                  (r.find.ID = function (e, t) {
                    if ("undefined" != typeof t.getElementById && g) {
                      var n,
                        r,
                        i,
                        o = t.getElementById(e);
                      if (o) {
                        if ((n = o.getAttributeNode("id")) && n.value === e)
                          return [o];
                        (i = t.getElementsByName(e)), (r = 0);
                        while ((o = i[r++]))
                          if ((n = o.getAttributeNode("id")) && n.value === e)
                            return [o];
                      }
                      return [];
                    }
                  })),
              (r.find.TAG = n.getElementsByTagName
                ? function (e, t) {
                    return "undefined" != typeof t.getElementsByTagName
                      ? t.getElementsByTagName(e)
                      : n.qsa
                        ? t.querySelectorAll(e)
                        : void 0;
                  }
                : function (e, t) {
                    var n,
                      r = [],
                      i = 0,
                      o = t.getElementsByTagName(e);
                    if ("*" === e) {
                      while ((n = o[i++])) 1 === n.nodeType && r.push(n);
                      return r;
                    }
                    return o;
                  }),
              (r.find.CLASS =
                n.getElementsByClassName &&
                function (e, t) {
                  if ("undefined" != typeof t.getElementsByClassName && g)
                    return t.getElementsByClassName(e);
                }),
              (v = []),
              (y = []),
              (n.qsa = Q.test(d.querySelectorAll)) &&
                (ue(function (e) {
                  (h.appendChild(e).innerHTML =
                    "<a id='" +
                    b +
                    "'></a><select id='" +
                    b +
                    "-\r\\' msallowcapture=''><option selected=''></option></select>"),
                    e.querySelectorAll("[msallowcapture^='']").length &&
                      y.push("[*^$]=" + M + "*(?:''|\"\")"),
                    e.querySelectorAll("[selected]").length ||
                      y.push("\\[" + M + "*(?:value|" + P + ")"),
                    e.querySelectorAll("[id~=" + b + "-]").length ||
                      y.push("~="),
                    e.querySelectorAll(":checked").length || y.push(":checked"),
                    e.querySelectorAll("a#" + b + "+*").length ||
                      y.push(".#.+[+~]");
                }),
                ue(function (e) {
                  e.innerHTML =
                    "<a href='' disabled='disabled'></a><select disabled='disabled'><option/></select>";
                  var t = d.createElement("input");
                  t.setAttribute("type", "hidden"),
                    e.appendChild(t).setAttribute("name", "D"),
                    e.querySelectorAll("[name=d]").length &&
                      y.push("name" + M + "*[*^$|!~]?="),
                    2 !== e.querySelectorAll(":enabled").length &&
                      y.push(":enabled", ":disabled"),
                    (h.appendChild(e).disabled = !0),
                    2 !== e.querySelectorAll(":disabled").length &&
                      y.push(":enabled", ":disabled"),
                    e.querySelectorAll("*,:x"),
                    y.push(",.*:");
                })),
              (n.matchesSelector = Q.test(
                (m =
                  h.matches ||
                  h.webkitMatchesSelector ||
                  h.mozMatchesSelector ||
                  h.oMatchesSelector ||
                  h.msMatchesSelector)
              )) &&
                ue(function (e) {
                  (n.disconnectedMatch = m.call(e, "*")),
                    m.call(e, "[s!='']:x"),
                    v.push("!=", W);
                }),
              (y = y.length && new RegExp(y.join("|"))),
              (v = v.length && new RegExp(v.join("|"))),
              (t = Q.test(h.compareDocumentPosition)),
              (x =
                t || Q.test(h.contains)
                  ? function (e, t) {
                      var n = 9 === e.nodeType ? e.documentElement : e,
                        r = t && t.parentNode;
                      return (
                        e === r ||
                        !(
                          !r ||
                          1 !== r.nodeType ||
                          !(n.contains
                            ? n.contains(r)
                            : e.compareDocumentPosition &&
                              16 & e.compareDocumentPosition(r))
                        )
                      );
                    }
                  : function (e, t) {
                      if (t) while ((t = t.parentNode)) if (t === e) return !0;
                      return !1;
                    }),
              (D = t
                ? function (e, t) {
                    if (e === t) return (f = !0), 0;
                    var r =
                      !e.compareDocumentPosition - !t.compareDocumentPosition;
                    return (
                      r ||
                      (1 &
                        (r =
                          (e.ownerDocument || e) === (t.ownerDocument || t)
                            ? e.compareDocumentPosition(t)
                            : 1) ||
                      (!n.sortDetached && t.compareDocumentPosition(e) === r)
                        ? e === d || (e.ownerDocument === w && x(w, e))
                          ? -1
                          : t === d || (t.ownerDocument === w && x(w, t))
                            ? 1
                            : c
                              ? O(c, e) - O(c, t)
                              : 0
                        : 4 & r
                          ? -1
                          : 1)
                    );
                  }
                : function (e, t) {
                    if (e === t) return (f = !0), 0;
                    var n,
                      r = 0,
                      i = e.parentNode,
                      o = t.parentNode,
                      a = [e],
                      s = [t];
                    if (!i || !o)
                      return e === d
                        ? -1
                        : t === d
                          ? 1
                          : i
                            ? -1
                            : o
                              ? 1
                              : c
                                ? O(c, e) - O(c, t)
                                : 0;
                    if (i === o) return ce(e, t);
                    n = e;
                    while ((n = n.parentNode)) a.unshift(n);
                    n = t;
                    while ((n = n.parentNode)) s.unshift(n);
                    while (a[r] === s[r]) r++;
                    return r
                      ? ce(a[r], s[r])
                      : a[r] === w
                        ? -1
                        : s[r] === w
                          ? 1
                          : 0;
                  }),
              d)
            : d;
        }),
      (oe.matches = function (e, t) {
        return oe(e, null, null, t);
      }),
      (oe.matchesSelector = function (e, t) {
        if (
          ((e.ownerDocument || e) !== d && p(e),
          (t = t.replace(z, "='$1']")),
          n.matchesSelector &&
            g &&
            !S[t + " "] &&
            (!v || !v.test(t)) &&
            (!y || !y.test(t)))
        )
          try {
            var r = m.call(e, t);
            if (
              r ||
              n.disconnectedMatch ||
              (e.document && 11 !== e.document.nodeType)
            )
              return r;
          } catch (e) {}
        return oe(t, d, null, [e]).length > 0;
      }),
      (oe.contains = function (e, t) {
        return (e.ownerDocument || e) !== d && p(e), x(e, t);
      }),
      (oe.attr = function (e, t) {
        (e.ownerDocument || e) !== d && p(e);
        var i = r.attrHandle[t.toLowerCase()],
          o = i && N.call(r.attrHandle, t.toLowerCase()) ? i(e, t, !g) : void 0;
        return void 0 !== o
          ? o
          : n.attributes || !g
            ? e.getAttribute(t)
            : (o = e.getAttributeNode(t)) && o.specified
              ? o.value
              : null;
      }),
      (oe.escape = function (e) {
        return (e + "").replace(te, ne);
      }),
      (oe.error = function (e) {
        throw new Error("Syntax error, unrecognized expression: " + e);
      }),
      (oe.uniqueSort = function (e) {
        var t,
          r = [],
          i = 0,
          o = 0;
        if (
          ((f = !n.detectDuplicates),
          (c = !n.sortStable && e.slice(0)),
          e.sort(D),
          f)
        ) {
          while ((t = e[o++])) t === e[o] && (i = r.push(o));
          while (i--) e.splice(r[i], 1);
        }
        return (c = null), e;
      }),
      (i = oe.getText =
        function (e) {
          var t,
            n = "",
            r = 0,
            o = e.nodeType;
          if (o) {
            if (1 === o || 9 === o || 11 === o) {
              if ("string" == typeof e.textContent) return e.textContent;
              for (e = e.firstChild; e; e = e.nextSibling) n += i(e);
            } else if (3 === o || 4 === o) return e.nodeValue;
          } else while ((t = e[r++])) n += i(t);
          return n;
        }),
      ((r = oe.selectors =
        {
          cacheLength: 50,
          createPseudo: se,
          match: V,
          attrHandle: {},
          find: {},
          relative: {
            ">": { dir: "parentNode", first: !0 },
            " ": { dir: "parentNode" },
            "+": { dir: "previousSibling", first: !0 },
            "~": { dir: "previousSibling" },
          },
          preFilter: {
            ATTR: function (e) {
              return (
                (e[1] = e[1].replace(Z, ee)),
                (e[3] = (e[3] || e[4] || e[5] || "").replace(Z, ee)),
                "~=" === e[2] && (e[3] = " " + e[3] + " "),
                e.slice(0, 4)
              );
            },
            CHILD: function (e) {
              return (
                (e[1] = e[1].toLowerCase()),
                "nth" === e[1].slice(0, 3)
                  ? (e[3] || oe.error(e[0]),
                    (e[4] = +(e[4]
                      ? e[5] + (e[6] || 1)
                      : 2 * ("even" === e[3] || "odd" === e[3]))),
                    (e[5] = +(e[7] + e[8] || "odd" === e[3])))
                  : e[3] && oe.error(e[0]),
                e
              );
            },
            PSEUDO: function (e) {
              var t,
                n = !e[6] && e[2];
              return V.CHILD.test(e[0])
                ? null
                : (e[3]
                    ? (e[2] = e[4] || e[5] || "")
                    : n &&
                      X.test(n) &&
                      (t = a(n, !0)) &&
                      (t = n.indexOf(")", n.length - t) - n.length) &&
                      ((e[0] = e[0].slice(0, t)), (e[2] = n.slice(0, t))),
                  e.slice(0, 3));
            },
          },
          filter: {
            TAG: function (e) {
              var t = e.replace(Z, ee).toLowerCase();
              return "*" === e
                ? function () {
                    return !0;
                  }
                : function (e) {
                    return e.nodeName && e.nodeName.toLowerCase() === t;
                  };
            },
            CLASS: function (e) {
              var t = E[e + " "];
              return (
                t ||
                ((t = new RegExp("(^|" + M + ")" + e + "(" + M + "|$)")) &&
                  E(e, function (e) {
                    return t.test(
                      ("string" == typeof e.className && e.className) ||
                        ("undefined" != typeof e.getAttribute &&
                          e.getAttribute("class")) ||
                        ""
                    );
                  }))
              );
            },
            ATTR: function (e, t, n) {
              return function (r) {
                var i = oe.attr(r, e);
                return null == i
                  ? "!=" === t
                  : !t ||
                      ((i += ""),
                      "=" === t
                        ? i === n
                        : "!=" === t
                          ? i !== n
                          : "^=" === t
                            ? n && 0 === i.indexOf(n)
                            : "*=" === t
                              ? n && i.indexOf(n) > -1
                              : "$=" === t
                                ? n && i.slice(-n.length) === n
                                : "~=" === t
                                  ? (" " + i.replace($, " ") + " ").indexOf(n) >
                                    -1
                                  : "|=" === t &&
                                    (i === n ||
                                      i.slice(0, n.length + 1) === n + "-"));
              };
            },
            CHILD: function (e, t, n, r, i) {
              var o = "nth" !== e.slice(0, 3),
                a = "last" !== e.slice(-4),
                s = "of-type" === t;
              return 1 === r && 0 === i
                ? function (e) {
                    return !!e.parentNode;
                  }
                : function (t, n, u) {
                    var l,
                      c,
                      f,
                      p,
                      d,
                      h,
                      g = o !== a ? "nextSibling" : "previousSibling",
                      y = t.parentNode,
                      v = s && t.nodeName.toLowerCase(),
                      m = !u && !s,
                      x = !1;
                    if (y) {
                      if (o) {
                        while (g) {
                          p = t;
                          while ((p = p[g]))
                            if (
                              s
                                ? p.nodeName.toLowerCase() === v
                                : 1 === p.nodeType
                            )
                              return !1;
                          h = g = "only" === e && !h && "nextSibling";
                        }
                        return !0;
                      }
                      if (((h = [a ? y.firstChild : y.lastChild]), a && m)) {
                        (x =
                          (d =
                            (l =
                              (c =
                                (f = (p = y)[b] || (p[b] = {}))[p.uniqueID] ||
                                (f[p.uniqueID] = {}))[e] || [])[0] === T &&
                            l[1]) && l[2]),
                          (p = d && y.childNodes[d]);
                        while (
                          (p = (++d && p && p[g]) || (x = d = 0) || h.pop())
                        )
                          if (1 === p.nodeType && ++x && p === t) {
                            c[e] = [T, d, x];
                            break;
                          }
                      } else if (
                        (m &&
                          (x = d =
                            (l =
                              (c =
                                (f = (p = t)[b] || (p[b] = {}))[p.uniqueID] ||
                                (f[p.uniqueID] = {}))[e] || [])[0] === T &&
                            l[1]),
                        !1 === x)
                      )
                        while (
                          (p = (++d && p && p[g]) || (x = d = 0) || h.pop())
                        )
                          if (
                            (s
                              ? p.nodeName.toLowerCase() === v
                              : 1 === p.nodeType) &&
                            ++x &&
                            (m &&
                              ((c =
                                (f = p[b] || (p[b] = {}))[p.uniqueID] ||
                                (f[p.uniqueID] = {}))[e] = [T, x]),
                            p === t)
                          )
                            break;
                      return (x -= i) === r || (x % r == 0 && x / r >= 0);
                    }
                  };
            },
            PSEUDO: function (e, t) {
              var n,
                i =
                  r.pseudos[e] ||
                  r.setFilters[e.toLowerCase()] ||
                  oe.error("unsupported pseudo: " + e);
              return i[b]
                ? i(t)
                : i.length > 1
                  ? ((n = [e, e, "", t]),
                    r.setFilters.hasOwnProperty(e.toLowerCase())
                      ? se(function (e, n) {
                          var r,
                            o = i(e, t),
                            a = o.length;
                          while (a--) e[(r = O(e, o[a]))] = !(n[r] = o[a]);
                        })
                      : function (e) {
                          return i(e, 0, n);
                        })
                  : i;
            },
          },
          pseudos: {
            not: se(function (e) {
              var t = [],
                n = [],
                r = s(e.replace(B, "$1"));
              return r[b]
                ? se(function (e, t, n, i) {
                    var o,
                      a = r(e, null, i, []),
                      s = e.length;
                    while (s--) (o = a[s]) && (e[s] = !(t[s] = o));
                  })
                : function (e, i, o) {
                    return (
                      (t[0] = e), r(t, null, o, n), (t[0] = null), !n.pop()
                    );
                  };
            }),
            has: se(function (e) {
              return function (t) {
                return oe(e, t).length > 0;
              };
            }),
            contains: se(function (e) {
              return (
                (e = e.replace(Z, ee)),
                function (t) {
                  return (t.textContent || t.innerText || i(t)).indexOf(e) > -1;
                }
              );
            }),
            lang: se(function (e) {
              return (
                U.test(e || "") || oe.error("unsupported lang: " + e),
                (e = e.replace(Z, ee).toLowerCase()),
                function (t) {
                  var n;
                  do {
                    if (
                      (n = g
                        ? t.lang
                        : t.getAttribute("xml:lang") || t.getAttribute("lang"))
                    )
                      return (
                        (n = n.toLowerCase()) === e || 0 === n.indexOf(e + "-")
                      );
                  } while ((t = t.parentNode) && 1 === t.nodeType);
                  return !1;
                }
              );
            }),
            target: function (t) {
              var n = e.location && e.location.hash;
              return n && n.slice(1) === t.id;
            },
            root: function (e) {
              return e === h;
            },
            focus: function (e) {
              return (
                e === d.activeElement &&
                (!d.hasFocus || d.hasFocus()) &&
                !!(e.type || e.href || ~e.tabIndex)
              );
            },
            enabled: de(!1),
            disabled: de(!0),
            checked: function (e) {
              var t = e.nodeName.toLowerCase();
              return (
                ("input" === t && !!e.checked) ||
                ("option" === t && !!e.selected)
              );
            },
            selected: function (e) {
              return (
                e.parentNode && e.parentNode.selectedIndex, !0 === e.selected
              );
            },
            empty: function (e) {
              for (e = e.firstChild; e; e = e.nextSibling)
                if (e.nodeType < 6) return !1;
              return !0;
            },
            parent: function (e) {
              return !r.pseudos.empty(e);
            },
            header: function (e) {
              return Y.test(e.nodeName);
            },
            input: function (e) {
              return G.test(e.nodeName);
            },
            button: function (e) {
              var t = e.nodeName.toLowerCase();
              return ("input" === t && "button" === e.type) || "button" === t;
            },
            text: function (e) {
              var t;
              return (
                "input" === e.nodeName.toLowerCase() &&
                "text" === e.type &&
                (null == (t = e.getAttribute("type")) ||
                  "text" === t.toLowerCase())
              );
            },
            first: he(function () {
              return [0];
            }),
            last: he(function (e, t) {
              return [t - 1];
            }),
            eq: he(function (e, t, n) {
              return [n < 0 ? n + t : n];
            }),
            even: he(function (e, t) {
              for (var n = 0; n < t; n += 2) e.push(n);
              return e;
            }),
            odd: he(function (e, t) {
              for (var n = 1; n < t; n += 2) e.push(n);
              return e;
            }),
            lt: he(function (e, t, n) {
              for (var r = n < 0 ? n + t : n; --r >= 0; ) e.push(r);
              return e;
            }),
            gt: he(function (e, t, n) {
              for (var r = n < 0 ? n + t : n; ++r < t; ) e.push(r);
              return e;
            }),
          },
        }).pseudos.nth = r.pseudos.eq);
    for (t in { radio: !0, checkbox: !0, file: !0, password: !0, image: !0 })
      r.pseudos[t] = fe(t);
    for (t in { submit: !0, reset: !0 }) r.pseudos[t] = pe(t);
    function ye() {}
    (ye.prototype = r.filters = r.pseudos),
      (r.setFilters = new ye()),
      (a = oe.tokenize =
        function (e, t) {
          var n,
            i,
            o,
            a,
            s,
            u,
            l,
            c = k[e + " "];
          if (c) return t ? 0 : c.slice(0);
          (s = e), (u = []), (l = r.preFilter);
          while (s) {
            (n && !(i = F.exec(s))) ||
              (i && (s = s.slice(i[0].length) || s), u.push((o = []))),
              (n = !1),
              (i = _.exec(s)) &&
                ((n = i.shift()),
                o.push({ value: n, type: i[0].replace(B, " ") }),
                (s = s.slice(n.length)));
            for (a in r.filter)
              !(i = V[a].exec(s)) ||
                (l[a] && !(i = l[a](i))) ||
                ((n = i.shift()),
                o.push({ value: n, type: a, matches: i }),
                (s = s.slice(n.length)));
            if (!n) break;
          }
          return t ? s.length : s ? oe.error(e) : k(e, u).slice(0);
        });
    function ve(e) {
      for (var t = 0, n = e.length, r = ""; t < n; t++) r += e[t].value;
      return r;
    }
    function me(e, t, n) {
      var r = t.dir,
        i = t.next,
        o = i || r,
        a = n && "parentNode" === o,
        s = C++;
      return t.first
        ? function (t, n, i) {
            while ((t = t[r])) if (1 === t.nodeType || a) return e(t, n, i);
            return !1;
          }
        : function (t, n, u) {
            var l,
              c,
              f,
              p = [T, s];
            if (u) {
              while ((t = t[r]))
                if ((1 === t.nodeType || a) && e(t, n, u)) return !0;
            } else
              while ((t = t[r]))
                if (1 === t.nodeType || a)
                  if (
                    ((f = t[b] || (t[b] = {})),
                    (c = f[t.uniqueID] || (f[t.uniqueID] = {})),
                    i && i === t.nodeName.toLowerCase())
                  )
                    t = t[r] || t;
                  else {
                    if ((l = c[o]) && l[0] === T && l[1] === s)
                      return (p[2] = l[2]);
                    if (((c[o] = p), (p[2] = e(t, n, u)))) return !0;
                  }
            return !1;
          };
    }
    function xe(e) {
      return e.length > 1
        ? function (t, n, r) {
            var i = e.length;
            while (i--) if (!e[i](t, n, r)) return !1;
            return !0;
          }
        : e[0];
    }
    function be(e, t, n) {
      for (var r = 0, i = t.length; r < i; r++) oe(e, t[r], n);
      return n;
    }
    function we(e, t, n, r, i) {
      for (var o, a = [], s = 0, u = e.length, l = null != t; s < u; s++)
        (o = e[s]) && ((n && !n(o, r, i)) || (a.push(o), l && t.push(s)));
      return a;
    }
    function Te(e, t, n, r, i, o) {
      return (
        r && !r[b] && (r = Te(r)),
        i && !i[b] && (i = Te(i, o)),
        se(function (o, a, s, u) {
          var l,
            c,
            f,
            p = [],
            d = [],
            h = a.length,
            g = o || be(t || "*", s.nodeType ? [s] : s, []),
            y = !e || (!o && t) ? g : we(g, p, e, s, u),
            v = n ? (i || (o ? e : h || r) ? [] : a) : y;
          if ((n && n(y, v, s, u), r)) {
            (l = we(v, d)), r(l, [], s, u), (c = l.length);
            while (c--) (f = l[c]) && (v[d[c]] = !(y[d[c]] = f));
          }
          if (o) {
            if (i || e) {
              if (i) {
                (l = []), (c = v.length);
                while (c--) (f = v[c]) && l.push((y[c] = f));
                i(null, (v = []), l, u);
              }
              c = v.length;
              while (c--)
                (f = v[c]) &&
                  (l = i ? O(o, f) : p[c]) > -1 &&
                  (o[l] = !(a[l] = f));
            }
          } else
            (v = we(v === a ? v.splice(h, v.length) : v)),
              i ? i(null, a, v, u) : L.apply(a, v);
        })
      );
    }
    function Ce(e) {
      for (
        var t,
          n,
          i,
          o = e.length,
          a = r.relative[e[0].type],
          s = a || r.relative[" "],
          u = a ? 1 : 0,
          c = me(
            function (e) {
              return e === t;
            },
            s,
            !0
          ),
          f = me(
            function (e) {
              return O(t, e) > -1;
            },
            s,
            !0
          ),
          p = [
            function (e, n, r) {
              var i =
                (!a && (r || n !== l)) ||
                ((t = n).nodeType ? c(e, n, r) : f(e, n, r));
              return (t = null), i;
            },
          ];
        u < o;
        u++
      )
        if ((n = r.relative[e[u].type])) p = [me(xe(p), n)];
        else {
          if ((n = r.filter[e[u].type].apply(null, e[u].matches))[b]) {
            for (i = ++u; i < o; i++) if (r.relative[e[i].type]) break;
            return Te(
              u > 1 && xe(p),
              u > 1 &&
                ve(
                  e
                    .slice(0, u - 1)
                    .concat({ value: " " === e[u - 2].type ? "*" : "" })
                ).replace(B, "$1"),
              n,
              u < i && Ce(e.slice(u, i)),
              i < o && Ce((e = e.slice(i))),
              i < o && ve(e)
            );
          }
          p.push(n);
        }
      return xe(p);
    }
    function Ee(e, t) {
      var n = t.length > 0,
        i = e.length > 0,
        o = function (o, a, s, u, c) {
          var f,
            h,
            y,
            v = 0,
            m = "0",
            x = o && [],
            b = [],
            w = l,
            C = o || (i && r.find.TAG("*", c)),
            E = (T += null == w ? 1 : Math.random() || 0.1),
            k = C.length;
          for (
            c && (l = a === d || a || c);
            m !== k && null != (f = C[m]);
            m++
          ) {
            if (i && f) {
              (h = 0), a || f.ownerDocument === d || (p(f), (s = !g));
              while ((y = e[h++]))
                if (y(f, a || d, s)) {
                  u.push(f);
                  break;
                }
              c && (T = E);
            }
            n && ((f = !y && f) && v--, o && x.push(f));
          }
          if (((v += m), n && m !== v)) {
            h = 0;
            while ((y = t[h++])) y(x, b, a, s);
            if (o) {
              if (v > 0) while (m--) x[m] || b[m] || (b[m] = j.call(u));
              b = we(b);
            }
            L.apply(u, b),
              c && !o && b.length > 0 && v + t.length > 1 && oe.uniqueSort(u);
          }
          return c && ((T = E), (l = w)), x;
        };
      return n ? se(o) : o;
    }
    return (
      (s = oe.compile =
        function (e, t) {
          var n,
            r = [],
            i = [],
            o = S[e + " "];
          if (!o) {
            t || (t = a(e)), (n = t.length);
            while (n--) (o = Ce(t[n]))[b] ? r.push(o) : i.push(o);
            (o = S(e, Ee(i, r))).selector = e;
          }
          return o;
        }),
      (u = oe.select =
        function (e, t, n, i) {
          var o,
            u,
            l,
            c,
            f,
            p = "function" == typeof e && e,
            d = !i && a((e = p.selector || e));
          if (((n = n || []), 1 === d.length)) {
            if (
              (u = d[0] = d[0].slice(0)).length > 2 &&
              "ID" === (l = u[0]).type &&
              9 === t.nodeType &&
              g &&
              r.relative[u[1].type]
            ) {
              if (!(t = (r.find.ID(l.matches[0].replace(Z, ee), t) || [])[0]))
                return n;
              p && (t = t.parentNode), (e = e.slice(u.shift().value.length));
            }
            o = V.needsContext.test(e) ? 0 : u.length;
            while (o--) {
              if (((l = u[o]), r.relative[(c = l.type)])) break;
              if (
                (f = r.find[c]) &&
                (i = f(
                  l.matches[0].replace(Z, ee),
                  (K.test(u[0].type) && ge(t.parentNode)) || t
                ))
              ) {
                if ((u.splice(o, 1), !(e = i.length && ve(u))))
                  return L.apply(n, i), n;
                break;
              }
            }
          }
          return (
            (p || s(e, d))(
              i,
              t,
              !g,
              n,
              !t || (K.test(e) && ge(t.parentNode)) || t
            ),
            n
          );
        }),
      (n.sortStable = b.split("").sort(D).join("") === b),
      (n.detectDuplicates = !!f),
      p(),
      (n.sortDetached = ue(function (e) {
        return 1 & e.compareDocumentPosition(d.createElement("fieldset"));
      })),
      ue(function (e) {
        return (
          (e.innerHTML = "<a href='#'></a>"),
          "#" === e.firstChild.getAttribute("href")
        );
      }) ||
        le("type|href|height|width", function (e, t, n) {
          if (!n) return e.getAttribute(t, "type" === t.toLowerCase() ? 1 : 2);
        }),
      (n.attributes &&
        ue(function (e) {
          return (
            (e.innerHTML = "<input/>"),
            e.firstChild.setAttribute("value", ""),
            "" === e.firstChild.getAttribute("value")
          );
        })) ||
        le("value", function (e, t, n) {
          if (!n && "input" === e.nodeName.toLowerCase()) return e.defaultValue;
        }),
      ue(function (e) {
        return null == e.getAttribute("disabled");
      }) ||
        le(P, function (e, t, n) {
          var r;
          if (!n)
            return !0 === e[t]
              ? t.toLowerCase()
              : (r = e.getAttributeNode(t)) && r.specified
                ? r.value
                : null;
        }),
      oe
    );
  })(e);
  (w.find = E),
    (w.expr = E.selectors),
    (w.expr[":"] = w.expr.pseudos),
    (w.uniqueSort = w.unique = E.uniqueSort),
    (w.text = E.getText),
    (w.isXMLDoc = E.isXML),
    (w.contains = E.contains),
    (w.escapeSelector = E.escape);
  var k = function (e, t, n) {
      var r = [],
        i = void 0 !== n;
      while ((e = e[t]) && 9 !== e.nodeType)
        if (1 === e.nodeType) {
          if (i && w(e).is(n)) break;
          r.push(e);
        }
      return r;
    },
    S = function (e, t) {
      for (var n = []; e; e = e.nextSibling)
        1 === e.nodeType && e !== t && n.push(e);
      return n;
    },
    D = w.expr.match.needsContext;
  function N(e, t) {
    return e.nodeName && e.nodeName.toLowerCase() === t.toLowerCase();
  }
  var A = /^<([a-z][^\/\0>:\x20\t\r\n\f]*)[\x20\t\r\n\f]*\/?>(?:<\/\1>|)$/i;
  function j(e, t, n) {
    return g(t)
      ? w.grep(e, function (e, r) {
          return !!t.call(e, r, e) !== n;
        })
      : t.nodeType
        ? w.grep(e, function (e) {
            return (e === t) !== n;
          })
        : "string" != typeof t
          ? w.grep(e, function (e) {
              return u.call(t, e) > -1 !== n;
            })
          : w.filter(t, e, n);
  }
  (w.filter = function (e, t, n) {
    var r = t[0];
    return (
      n && (e = ":not(" + e + ")"),
      1 === t.length && 1 === r.nodeType
        ? w.find.matchesSelector(r, e)
          ? [r]
          : []
        : w.find.matches(
            e,
            w.grep(t, function (e) {
              return 1 === e.nodeType;
            })
          )
    );
  }),
    w.fn.extend({
      find: function (e) {
        var t,
          n,
          r = this.length,
          i = this;
        if ("string" != typeof e)
          return this.pushStack(
            w(e).filter(function () {
              for (t = 0; t < r; t++) if (w.contains(i[t], this)) return !0;
            })
          );
        for (n = this.pushStack([]), t = 0; t < r; t++) w.find(e, i[t], n);
        return r > 1 ? w.uniqueSort(n) : n;
      },
      filter: function (e) {
        return this.pushStack(j(this, e || [], !1));
      },
      not: function (e) {
        return this.pushStack(j(this, e || [], !0));
      },
      is: function (e) {
        return !!j(this, "string" == typeof e && D.test(e) ? w(e) : e || [], !1)
          .length;
      },
    });
  var q,
    L = /^(?:\s*(<[\w\W]+>)[^>]*|#([\w-]+))$/;
  ((w.fn.init = function (e, t, n) {
    var i, o;
    if (!e) return this;
    if (((n = n || q), "string" == typeof e)) {
      if (
        !(i =
          "<" === e[0] && ">" === e[e.length - 1] && e.length >= 3
            ? [null, e, null]
            : L.exec(e)) ||
        (!i[1] && t)
      )
        return !t || t.jquery ? (t || n).find(e) : this.constructor(t).find(e);
      if (i[1]) {
        if (
          ((t = t instanceof w ? t[0] : t),
          w.merge(
            this,
            w.parseHTML(i[1], t && t.nodeType ? t.ownerDocument || t : r, !0)
          ),
          A.test(i[1]) && w.isPlainObject(t))
        )
          for (i in t) g(this[i]) ? this[i](t[i]) : this.attr(i, t[i]);
        return this;
      }
      return (
        (o = r.getElementById(i[2])) && ((this[0] = o), (this.length = 1)), this
      );
    }
    return e.nodeType
      ? ((this[0] = e), (this.length = 1), this)
      : g(e)
        ? void 0 !== n.ready
          ? n.ready(e)
          : e(w)
        : w.makeArray(e, this);
  }).prototype = w.fn),
    (q = w(r));
  var H = /^(?:parents|prev(?:Until|All))/,
    O = { children: !0, contents: !0, next: !0, prev: !0 };
  w.fn.extend({
    has: function (e) {
      var t = w(e, this),
        n = t.length;
      return this.filter(function () {
        for (var e = 0; e < n; e++) if (w.contains(this, t[e])) return !0;
      });
    },
    closest: function (e, t) {
      var n,
        r = 0,
        i = this.length,
        o = [],
        a = "string" != typeof e && w(e);
      if (!D.test(e))
        for (; r < i; r++)
          for (n = this[r]; n && n !== t; n = n.parentNode)
            if (
              n.nodeType < 11 &&
              (a
                ? a.index(n) > -1
                : 1 === n.nodeType && w.find.matchesSelector(n, e))
            ) {
              o.push(n);
              break;
            }
      return this.pushStack(o.length > 1 ? w.uniqueSort(o) : o);
    },
    index: function (e) {
      return e
        ? "string" == typeof e
          ? u.call(w(e), this[0])
          : u.call(this, e.jquery ? e[0] : e)
        : this[0] && this[0].parentNode
          ? this.first().prevAll().length
          : -1;
    },
    add: function (e, t) {
      return this.pushStack(w.uniqueSort(w.merge(this.get(), w(e, t))));
    },
    addBack: function (e) {
      return this.add(null == e ? this.prevObject : this.prevObject.filter(e));
    },
  });
  function P(e, t) {
    while ((e = e[t]) && 1 !== e.nodeType);
    return e;
  }
  w.each(
    {
      parent: function (e) {
        var t = e.parentNode;
        return t && 11 !== t.nodeType ? t : null;
      },
      parents: function (e) {
        return k(e, "parentNode");
      },
      parentsUntil: function (e, t, n) {
        return k(e, "parentNode", n);
      },
      next: function (e) {
        return P(e, "nextSibling");
      },
      prev: function (e) {
        return P(e, "previousSibling");
      },
      nextAll: function (e) {
        return k(e, "nextSibling");
      },
      prevAll: function (e) {
        return k(e, "previousSibling");
      },
      nextUntil: function (e, t, n) {
        return k(e, "nextSibling", n);
      },
      prevUntil: function (e, t, n) {
        return k(e, "previousSibling", n);
      },
      siblings: function (e) {
        return S((e.parentNode || {}).firstChild, e);
      },
      children: function (e) {
        return S(e.firstChild);
      },
      contents: function (e) {
        return N(e, "iframe")
          ? e.contentDocument
          : (N(e, "template") && (e = e.content || e),
            w.merge([], e.childNodes));
      },
    },
    function (e, t) {
      w.fn[e] = function (n, r) {
        var i = w.map(this, t, n);
        return (
          "Until" !== e.slice(-5) && (r = n),
          r && "string" == typeof r && (i = w.filter(r, i)),
          this.length > 1 &&
            (O[e] || w.uniqueSort(i), H.test(e) && i.reverse()),
          this.pushStack(i)
        );
      };
    }
  );
  var M = /[^\x20\t\r\n\f]+/g;
  function R(e) {
    var t = {};
    return (
      w.each(e.match(M) || [], function (e, n) {
        t[n] = !0;
      }),
      t
    );
  }
  w.Callbacks = function (e) {
    e = "string" == typeof e ? R(e) : w.extend({}, e);
    var t,
      n,
      r,
      i,
      o = [],
      a = [],
      s = -1,
      u = function () {
        for (i = i || e.once, r = t = !0; a.length; s = -1) {
          n = a.shift();
          while (++s < o.length)
            !1 === o[s].apply(n[0], n[1]) &&
              e.stopOnFalse &&
              ((s = o.length), (n = !1));
        }
        e.memory || (n = !1), (t = !1), i && (o = n ? [] : "");
      },
      l = {
        add: function () {
          return (
            o &&
              (n && !t && ((s = o.length - 1), a.push(n)),
              (function t(n) {
                w.each(n, function (n, r) {
                  g(r)
                    ? (e.unique && l.has(r)) || o.push(r)
                    : r && r.length && "string" !== x(r) && t(r);
                });
              })(arguments),
              n && !t && u()),
            this
          );
        },
        remove: function () {
          return (
            w.each(arguments, function (e, t) {
              var n;
              while ((n = w.inArray(t, o, n)) > -1)
                o.splice(n, 1), n <= s && s--;
            }),
            this
          );
        },
        has: function (e) {
          return e ? w.inArray(e, o) > -1 : o.length > 0;
        },
        empty: function () {
          return o && (o = []), this;
        },
        disable: function () {
          return (i = a = []), (o = n = ""), this;
        },
        disabled: function () {
          return !o;
        },
        lock: function () {
          return (i = a = []), n || t || (o = n = ""), this;
        },
        locked: function () {
          return !!i;
        },
        fireWith: function (e, n) {
          return (
            i ||
              ((n = [e, (n = n || []).slice ? n.slice() : n]),
              a.push(n),
              t || u()),
            this
          );
        },
        fire: function () {
          return l.fireWith(this, arguments), this;
        },
        fired: function () {
          return !!r;
        },
      };
    return l;
  };
  function I(e) {
    return e;
  }
  function W(e) {
    throw e;
  }
  function $(e, t, n, r) {
    var i;
    try {
      e && g((i = e.promise))
        ? i.call(e).done(t).fail(n)
        : e && g((i = e.then))
          ? i.call(e, t, n)
          : t.apply(void 0, [e].slice(r));
    } catch (e) {
      n.apply(void 0, [e]);
    }
  }
  w.extend({
    Deferred: function (t) {
      var n = [
          [
            "notify",
            "progress",
            w.Callbacks("memory"),
            w.Callbacks("memory"),
            2,
          ],
          [
            "resolve",
            "done",
            w.Callbacks("once memory"),
            w.Callbacks("once memory"),
            0,
            "resolved",
          ],
          [
            "reject",
            "fail",
            w.Callbacks("once memory"),
            w.Callbacks("once memory"),
            1,
            "rejected",
          ],
        ],
        r = "pending",
        i = {
          state: function () {
            return r;
          },
          always: function () {
            return o.done(arguments).fail(arguments), this;
          },
          catch: function (e) {
            return i.then(null, e);
          },
          pipe: function () {
            var e = arguments;
            return w
              .Deferred(function (t) {
                w.each(n, function (n, r) {
                  var i = g(e[r[4]]) && e[r[4]];
                  o[r[1]](function () {
                    var e = i && i.apply(this, arguments);
                    e && g(e.promise)
                      ? e
                          .promise()
                          .progress(t.notify)
                          .done(t.resolve)
                          .fail(t.reject)
                      : t[r[0] + "With"](this, i ? [e] : arguments);
                  });
                }),
                  (e = null);
              })
              .promise();
          },
          then: function (t, r, i) {
            var o = 0;
            function a(t, n, r, i) {
              return function () {
                var s = this,
                  u = arguments,
                  l = function () {
                    var e, l;
                    if (!(t < o)) {
                      if ((e = r.apply(s, u)) === n.promise())
                        throw new TypeError("Thenable self-resolution");
                      (l =
                        e &&
                        ("object" == typeof e || "function" == typeof e) &&
                        e.then),
                        g(l)
                          ? i
                            ? l.call(e, a(o, n, I, i), a(o, n, W, i))
                            : (o++,
                              l.call(
                                e,
                                a(o, n, I, i),
                                a(o, n, W, i),
                                a(o, n, I, n.notifyWith)
                              ))
                          : (r !== I && ((s = void 0), (u = [e])),
                            (i || n.resolveWith)(s, u));
                    }
                  },
                  c = i
                    ? l
                    : function () {
                        try {
                          l();
                        } catch (e) {
                          w.Deferred.exceptionHook &&
                            w.Deferred.exceptionHook(e, c.stackTrace),
                            t + 1 >= o &&
                              (r !== W && ((s = void 0), (u = [e])),
                              n.rejectWith(s, u));
                        }
                      };
                t
                  ? c()
                  : (w.Deferred.getStackHook &&
                      (c.stackTrace = w.Deferred.getStackHook()),
                    e.setTimeout(c));
              };
            }
            return w
              .Deferred(function (e) {
                n[0][3].add(a(0, e, g(i) ? i : I, e.notifyWith)),
                  n[1][3].add(a(0, e, g(t) ? t : I)),
                  n[2][3].add(a(0, e, g(r) ? r : W));
              })
              .promise();
          },
          promise: function (e) {
            return null != e ? w.extend(e, i) : i;
          },
        },
        o = {};
      return (
        w.each(n, function (e, t) {
          var a = t[2],
            s = t[5];
          (i[t[1]] = a.add),
            s &&
              a.add(
                function () {
                  r = s;
                },
                n[3 - e][2].disable,
                n[3 - e][3].disable,
                n[0][2].lock,
                n[0][3].lock
              ),
            a.add(t[3].fire),
            (o[t[0]] = function () {
              return (
                o[t[0] + "With"](this === o ? void 0 : this, arguments), this
              );
            }),
            (o[t[0] + "With"] = a.fireWith);
        }),
        i.promise(o),
        t && t.call(o, o),
        o
      );
    },
    when: function (e) {
      var t = arguments.length,
        n = t,
        r = Array(n),
        i = o.call(arguments),
        a = w.Deferred(),
        s = function (e) {
          return function (n) {
            (r[e] = this),
              (i[e] = arguments.length > 1 ? o.call(arguments) : n),
              --t || a.resolveWith(r, i);
          };
        };
      if (
        t <= 1 &&
        ($(e, a.done(s(n)).resolve, a.reject, !t),
        "pending" === a.state() || g(i[n] && i[n].then))
      )
        return a.then();
      while (n--) $(i[n], s(n), a.reject);
      return a.promise();
    },
  });
  var B = /^(Eval|Internal|Range|Reference|Syntax|Type|URI)Error$/;
  (w.Deferred.exceptionHook = function (t, n) {
    e.console &&
      e.console.warn &&
      t &&
      B.test(t.name) &&
      e.console.warn("jQuery.Deferred exception: " + t.message, t.stack, n);
  }),
    (w.readyException = function (t) {
      e.setTimeout(function () {
        throw t;
      });
    });
  var F = w.Deferred();
  (w.fn.ready = function (e) {
    return (
      F.then(e)["catch"](function (e) {
        w.readyException(e);
      }),
      this
    );
  }),
    w.extend({
      isReady: !1,
      readyWait: 1,
      ready: function (e) {
        (!0 === e ? --w.readyWait : w.isReady) ||
          ((w.isReady = !0),
          (!0 !== e && --w.readyWait > 0) || F.resolveWith(r, [w]));
      },
    }),
    (w.ready.then = F.then);
  function _() {
    r.removeEventListener("DOMContentLoaded", _),
      e.removeEventListener("load", _),
      w.ready();
  }
  "complete" === r.readyState ||
  ("loading" !== r.readyState && !r.documentElement.doScroll)
    ? e.setTimeout(w.ready)
    : (r.addEventListener("DOMContentLoaded", _),
      e.addEventListener("load", _));
  var z = function (e, t, n, r, i, o, a) {
      var s = 0,
        u = e.length,
        l = null == n;
      if ("object" === x(n)) {
        i = !0;
        for (s in n) z(e, t, s, n[s], !0, o, a);
      } else if (
        void 0 !== r &&
        ((i = !0),
        g(r) || (a = !0),
        l &&
          (a
            ? (t.call(e, r), (t = null))
            : ((l = t),
              (t = function (e, t, n) {
                return l.call(w(e), n);
              }))),
        t)
      )
        for (; s < u; s++) t(e[s], n, a ? r : r.call(e[s], s, t(e[s], n)));
      return i ? e : l ? t.call(e) : u ? t(e[0], n) : o;
    },
    X = /^-ms-/,
    U = /-([a-z])/g;
  function V(e, t) {
    return t.toUpperCase();
  }
  function G(e) {
    return e.replace(X, "ms-").replace(U, V);
  }
  var Y = function (e) {
    return 1 === e.nodeType || 9 === e.nodeType || !+e.nodeType;
  };
  function Q() {
    this.expando = w.expando + Q.uid++;
  }
  (Q.uid = 1),
    (Q.prototype = {
      cache: function (e) {
        var t = e[this.expando];
        return (
          t ||
            ((t = {}),
            Y(e) &&
              (e.nodeType
                ? (e[this.expando] = t)
                : Object.defineProperty(e, this.expando, {
                    value: t,
                    configurable: !0,
                  }))),
          t
        );
      },
      set: function (e, t, n) {
        var r,
          i = this.cache(e);
        if ("string" == typeof t) i[G(t)] = n;
        else for (r in t) i[G(r)] = t[r];
        return i;
      },
      get: function (e, t) {
        return void 0 === t
          ? this.cache(e)
          : e[this.expando] && e[this.expando][G(t)];
      },
      access: function (e, t, n) {
        return void 0 === t || (t && "string" == typeof t && void 0 === n)
          ? this.get(e, t)
          : (this.set(e, t, n), void 0 !== n ? n : t);
      },
      remove: function (e, t) {
        var n,
          r = e[this.expando];
        if (void 0 !== r) {
          if (void 0 !== t) {
            n = (t = Array.isArray(t)
              ? t.map(G)
              : (t = G(t)) in r
                ? [t]
                : t.match(M) || []).length;
            while (n--) delete r[t[n]];
          }
          (void 0 === t || w.isEmptyObject(r)) &&
            (e.nodeType ? (e[this.expando] = void 0) : delete e[this.expando]);
        }
      },
      hasData: function (e) {
        var t = e[this.expando];
        return void 0 !== t && !w.isEmptyObject(t);
      },
    });
  var J = new Q(),
    K = new Q(),
    Z = /^(?:\{[\w\W]*\}|\[[\w\W]*\])$/,
    ee = /[A-Z]/g;
  function te(e) {
    return (
      "true" === e ||
      ("false" !== e &&
        ("null" === e
          ? null
          : e === +e + ""
            ? +e
            : Z.test(e)
              ? JSON.parse(e)
              : e))
    );
  }
  function ne(e, t, n) {
    var r;
    if (void 0 === n && 1 === e.nodeType)
      if (
        ((r = "data-" + t.replace(ee, "-$&").toLowerCase()),
        "string" == typeof (n = e.getAttribute(r)))
      ) {
        try {
          n = te(n);
        } catch (e) {}
        K.set(e, t, n);
      } else n = void 0;
    return n;
  }
  w.extend({
    hasData: function (e) {
      return K.hasData(e) || J.hasData(e);
    },
    data: function (e, t, n) {
      return K.access(e, t, n);
    },
    removeData: function (e, t) {
      K.remove(e, t);
    },
    _data: function (e, t, n) {
      return J.access(e, t, n);
    },
    _removeData: function (e, t) {
      J.remove(e, t);
    },
  }),
    w.fn.extend({
      data: function (e, t) {
        var n,
          r,
          i,
          o = this[0],
          a = o && o.attributes;
        if (void 0 === e) {
          if (
            this.length &&
            ((i = K.get(o)), 1 === o.nodeType && !J.get(o, "hasDataAttrs"))
          ) {
            n = a.length;
            while (n--)
              a[n] &&
                0 === (r = a[n].name).indexOf("data-") &&
                ((r = G(r.slice(5))), ne(o, r, i[r]));
            J.set(o, "hasDataAttrs", !0);
          }
          return i;
        }
        return "object" == typeof e
          ? this.each(function () {
              K.set(this, e);
            })
          : z(
              this,
              function (t) {
                var n;
                if (o && void 0 === t) {
                  if (void 0 !== (n = K.get(o, e))) return n;
                  if (void 0 !== (n = ne(o, e))) return n;
                } else
                  this.each(function () {
                    K.set(this, e, t);
                  });
              },
              null,
              t,
              arguments.length > 1,
              null,
              !0
            );
      },
      removeData: function (e) {
        return this.each(function () {
          K.remove(this, e);
        });
      },
    }),
    w.extend({
      queue: function (e, t, n) {
        var r;
        if (e)
          return (
            (t = (t || "fx") + "queue"),
            (r = J.get(e, t)),
            n &&
              (!r || Array.isArray(n)
                ? (r = J.access(e, t, w.makeArray(n)))
                : r.push(n)),
            r || []
          );
      },
      dequeue: function (e, t) {
        t = t || "fx";
        var n = w.queue(e, t),
          r = n.length,
          i = n.shift(),
          o = w._queueHooks(e, t),
          a = function () {
            w.dequeue(e, t);
          };
        "inprogress" === i && ((i = n.shift()), r--),
          i &&
            ("fx" === t && n.unshift("inprogress"),
            delete o.stop,
            i.call(e, a, o)),
          !r && o && o.empty.fire();
      },
      _queueHooks: function (e, t) {
        var n = t + "queueHooks";
        return (
          J.get(e, n) ||
          J.access(e, n, {
            empty: w.Callbacks("once memory").add(function () {
              J.remove(e, [t + "queue", n]);
            }),
          })
        );
      },
    }),
    w.fn.extend({
      queue: function (e, t) {
        var n = 2;
        return (
          "string" != typeof e && ((t = e), (e = "fx"), n--),
          arguments.length < n
            ? w.queue(this[0], e)
            : void 0 === t
              ? this
              : this.each(function () {
                  var n = w.queue(this, e, t);
                  w._queueHooks(this, e),
                    "fx" === e && "inprogress" !== n[0] && w.dequeue(this, e);
                })
        );
      },
      dequeue: function (e) {
        return this.each(function () {
          w.dequeue(this, e);
        });
      },
      clearQueue: function (e) {
        return this.queue(e || "fx", []);
      },
      promise: function (e, t) {
        var n,
          r = 1,
          i = w.Deferred(),
          o = this,
          a = this.length,
          s = function () {
            --r || i.resolveWith(o, [o]);
          };
        "string" != typeof e && ((t = e), (e = void 0)), (e = e || "fx");
        while (a--)
          (n = J.get(o[a], e + "queueHooks")) &&
            n.empty &&
            (r++, n.empty.add(s));
        return s(), i.promise(t);
      },
    });
  var re = /[+-]?(?:\d*\.|)\d+(?:[eE][+-]?\d+|)/.source,
    ie = new RegExp("^(?:([+-])=|)(" + re + ")([a-z%]*)$", "i"),
    oe = ["Top", "Right", "Bottom", "Left"],
    ae = function (e, t) {
      return (
        "none" === (e = t || e).style.display ||
        ("" === e.style.display &&
          w.contains(e.ownerDocument, e) &&
          "none" === w.css(e, "display"))
      );
    },
    se = function (e, t, n, r) {
      var i,
        o,
        a = {};
      for (o in t) (a[o] = e.style[o]), (e.style[o] = t[o]);
      i = n.apply(e, r || []);
      for (o in t) e.style[o] = a[o];
      return i;
    };
  function ue(e, t, n, r) {
    var i,
      o,
      a = 20,
      s = r
        ? function () {
            return r.cur();
          }
        : function () {
            return w.css(e, t, "");
          },
      u = s(),
      l = (n && n[3]) || (w.cssNumber[t] ? "" : "px"),
      c = (w.cssNumber[t] || ("px" !== l && +u)) && ie.exec(w.css(e, t));
    if (c && c[3] !== l) {
      (u /= 2), (l = l || c[3]), (c = +u || 1);
      while (a--)
        w.style(e, t, c + l),
          (1 - o) * (1 - (o = s() / u || 0.5)) <= 0 && (a = 0),
          (c /= o);
      (c *= 2), w.style(e, t, c + l), (n = n || []);
    }
    return (
      n &&
        ((c = +c || +u || 0),
        (i = n[1] ? c + (n[1] + 1) * n[2] : +n[2]),
        r && ((r.unit = l), (r.start = c), (r.end = i))),
      i
    );
  }
  var le = {};
  function ce(e) {
    var t,
      n = e.ownerDocument,
      r = e.nodeName,
      i = le[r];
    return (
      i ||
      ((t = n.body.appendChild(n.createElement(r))),
      (i = w.css(t, "display")),
      t.parentNode.removeChild(t),
      "none" === i && (i = "block"),
      (le[r] = i),
      i)
    );
  }
  function fe(e, t) {
    for (var n, r, i = [], o = 0, a = e.length; o < a; o++)
      (r = e[o]).style &&
        ((n = r.style.display),
        t
          ? ("none" === n &&
              ((i[o] = J.get(r, "display") || null),
              i[o] || (r.style.display = "")),
            "" === r.style.display && ae(r) && (i[o] = ce(r)))
          : "none" !== n && ((i[o] = "none"), J.set(r, "display", n)));
    for (o = 0; o < a; o++) null != i[o] && (e[o].style.display = i[o]);
    return e;
  }
  w.fn.extend({
    show: function () {
      return fe(this, !0);
    },
    hide: function () {
      return fe(this);
    },
    toggle: function (e) {
      return "boolean" == typeof e
        ? e
          ? this.show()
          : this.hide()
        : this.each(function () {
            ae(this) ? w(this).show() : w(this).hide();
          });
    },
  });
  var pe = /^(?:checkbox|radio)$/i,
    de = /<([a-z][^\/\0>\x20\t\r\n\f]+)/i,
    he = /^$|^module$|\/(?:java|ecma)script/i,
    ge = {
      option: [1, "<select multiple='multiple'>", "</select>"],
      thead: [1, "<table>", "</table>"],
      col: [2, "<table><colgroup>", "</colgroup></table>"],
      tr: [2, "<table><tbody>", "</tbody></table>"],
      td: [3, "<table><tbody><tr>", "</tr></tbody></table>"],
      _default: [0, "", ""],
    };
  (ge.optgroup = ge.option),
    (ge.tbody = ge.tfoot = ge.colgroup = ge.caption = ge.thead),
    (ge.th = ge.td);
  function ye(e, t) {
    var n;
    return (
      (n =
        "undefined" != typeof e.getElementsByTagName
          ? e.getElementsByTagName(t || "*")
          : "undefined" != typeof e.querySelectorAll
            ? e.querySelectorAll(t || "*")
            : []),
      void 0 === t || (t && N(e, t)) ? w.merge([e], n) : n
    );
  }
  function ve(e, t) {
    for (var n = 0, r = e.length; n < r; n++)
      J.set(e[n], "globalEval", !t || J.get(t[n], "globalEval"));
  }
  var me = /<|&#?\w+;/;
  function xe(e, t, n, r, i) {
    for (
      var o,
        a,
        s,
        u,
        l,
        c,
        f = t.createDocumentFragment(),
        p = [],
        d = 0,
        h = e.length;
      d < h;
      d++
    )
      if ((o = e[d]) || 0 === o)
        if ("object" === x(o)) w.merge(p, o.nodeType ? [o] : o);
        else if (me.test(o)) {
          (a = a || f.appendChild(t.createElement("div"))),
            (s = (de.exec(o) || ["", ""])[1].toLowerCase()),
            (u = ge[s] || ge._default),
            (a.innerHTML = u[1] + w.htmlPrefilter(o) + u[2]),
            (c = u[0]);
          while (c--) a = a.lastChild;
          w.merge(p, a.childNodes), ((a = f.firstChild).textContent = "");
        } else p.push(t.createTextNode(o));
    (f.textContent = ""), (d = 0);
    while ((o = p[d++]))
      if (r && w.inArray(o, r) > -1) i && i.push(o);
      else if (
        ((l = w.contains(o.ownerDocument, o)),
        (a = ye(f.appendChild(o), "script")),
        l && ve(a),
        n)
      ) {
        c = 0;
        while ((o = a[c++])) he.test(o.type || "") && n.push(o);
      }
    return f;
  }
  !(function () {
    var e = r.createDocumentFragment().appendChild(r.createElement("div")),
      t = r.createElement("input");
    t.setAttribute("type", "radio"),
      t.setAttribute("checked", "checked"),
      t.setAttribute("name", "t"),
      e.appendChild(t),
      (h.checkClone = e.cloneNode(!0).cloneNode(!0).lastChild.checked),
      (e.innerHTML = "<textarea>x</textarea>"),
      (h.noCloneChecked = !!e.cloneNode(!0).lastChild.defaultValue);
  })();
  var be = r.documentElement,
    we = /^key/,
    Te = /^(?:mouse|pointer|contextmenu|drag|drop)|click/,
    Ce = /^([^.]*)(?:\.(.+)|)/;
  function Ee() {
    return !0;
  }
  function ke() {
    return !1;
  }
  function Se() {
    try {
      return r.activeElement;
    } catch (e) {}
  }
  function De(e, t, n, r, i, o) {
    var a, s;
    if ("object" == typeof t) {
      "string" != typeof n && ((r = r || n), (n = void 0));
      for (s in t) De(e, s, n, r, t[s], o);
      return e;
    }
    if (
      (null == r && null == i
        ? ((i = n), (r = n = void 0))
        : null == i &&
          ("string" == typeof n
            ? ((i = r), (r = void 0))
            : ((i = r), (r = n), (n = void 0))),
      !1 === i)
    )
      i = ke;
    else if (!i) return e;
    return (
      1 === o &&
        ((a = i),
        ((i = function (e) {
          return w().off(e), a.apply(this, arguments);
        }).guid = a.guid || (a.guid = w.guid++))),
      e.each(function () {
        w.event.add(this, t, i, r, n);
      })
    );
  }
  (w.event = {
    global: {},
    add: function (e, t, n, r, i) {
      var o,
        a,
        s,
        u,
        l,
        c,
        f,
        p,
        d,
        h,
        g,
        y = J.get(e);
      if (y) {
        n.handler && ((n = (o = n).handler), (i = o.selector)),
          i && w.find.matchesSelector(be, i),
          n.guid || (n.guid = w.guid++),
          (u = y.events) || (u = y.events = {}),
          (a = y.handle) ||
            (a = y.handle =
              function (t) {
                return "undefined" != typeof w && w.event.triggered !== t.type
                  ? w.event.dispatch.apply(e, arguments)
                  : void 0;
              }),
          (l = (t = (t || "").match(M) || [""]).length);
        while (l--)
          (d = g = (s = Ce.exec(t[l]) || [])[1]),
            (h = (s[2] || "").split(".").sort()),
            d &&
              ((f = w.event.special[d] || {}),
              (d = (i ? f.delegateType : f.bindType) || d),
              (f = w.event.special[d] || {}),
              (c = w.extend(
                {
                  type: d,
                  origType: g,
                  data: r,
                  handler: n,
                  guid: n.guid,
                  selector: i,
                  needsContext: i && w.expr.match.needsContext.test(i),
                  namespace: h.join("."),
                },
                o
              )),
              (p = u[d]) ||
                (((p = u[d] = []).delegateCount = 0),
                (f.setup && !1 !== f.setup.call(e, r, h, a)) ||
                  (e.addEventListener && e.addEventListener(d, a))),
              f.add &&
                (f.add.call(e, c), c.handler.guid || (c.handler.guid = n.guid)),
              i ? p.splice(p.delegateCount++, 0, c) : p.push(c),
              (w.event.global[d] = !0));
      }
    },
    remove: function (e, t, n, r, i) {
      var o,
        a,
        s,
        u,
        l,
        c,
        f,
        p,
        d,
        h,
        g,
        y = J.hasData(e) && J.get(e);
      if (y && (u = y.events)) {
        l = (t = (t || "").match(M) || [""]).length;
        while (l--)
          if (
            ((s = Ce.exec(t[l]) || []),
            (d = g = s[1]),
            (h = (s[2] || "").split(".").sort()),
            d)
          ) {
            (f = w.event.special[d] || {}),
              (p = u[(d = (r ? f.delegateType : f.bindType) || d)] || []),
              (s =
                s[2] &&
                new RegExp("(^|\\.)" + h.join("\\.(?:.*\\.|)") + "(\\.|$)")),
              (a = o = p.length);
            while (o--)
              (c = p[o]),
                (!i && g !== c.origType) ||
                  (n && n.guid !== c.guid) ||
                  (s && !s.test(c.namespace)) ||
                  (r && r !== c.selector && ("**" !== r || !c.selector)) ||
                  (p.splice(o, 1),
                  c.selector && p.delegateCount--,
                  f.remove && f.remove.call(e, c));
            a &&
              !p.length &&
              ((f.teardown && !1 !== f.teardown.call(e, h, y.handle)) ||
                w.removeEvent(e, d, y.handle),
              delete u[d]);
          } else for (d in u) w.event.remove(e, d + t[l], n, r, !0);
        w.isEmptyObject(u) && J.remove(e, "handle events");
      }
    },
    dispatch: function (e) {
      var t = w.event.fix(e),
        n,
        r,
        i,
        o,
        a,
        s,
        u = new Array(arguments.length),
        l = (J.get(this, "events") || {})[t.type] || [],
        c = w.event.special[t.type] || {};
      for (u[0] = t, n = 1; n < arguments.length; n++) u[n] = arguments[n];
      if (
        ((t.delegateTarget = this),
        !c.preDispatch || !1 !== c.preDispatch.call(this, t))
      ) {
        (s = w.event.handlers.call(this, t, l)), (n = 0);
        while ((o = s[n++]) && !t.isPropagationStopped()) {
          (t.currentTarget = o.elem), (r = 0);
          while ((a = o.handlers[r++]) && !t.isImmediatePropagationStopped())
            (t.rnamespace && !t.rnamespace.test(a.namespace)) ||
              ((t.handleObj = a),
              (t.data = a.data),
              void 0 !==
                (i = (
                  (w.event.special[a.origType] || {}).handle || a.handler
                ).apply(o.elem, u)) &&
                !1 === (t.result = i) &&
                (t.preventDefault(), t.stopPropagation()));
        }
        return c.postDispatch && c.postDispatch.call(this, t), t.result;
      }
    },
    handlers: function (e, t) {
      var n,
        r,
        i,
        o,
        a,
        s = [],
        u = t.delegateCount,
        l = e.target;
      if (u && l.nodeType && !("click" === e.type && e.button >= 1))
        for (; l !== this; l = l.parentNode || this)
          if (1 === l.nodeType && ("click" !== e.type || !0 !== l.disabled)) {
            for (o = [], a = {}, n = 0; n < u; n++)
              void 0 === a[(i = (r = t[n]).selector + " ")] &&
                (a[i] = r.needsContext
                  ? w(i, this).index(l) > -1
                  : w.find(i, this, null, [l]).length),
                a[i] && o.push(r);
            o.length && s.push({ elem: l, handlers: o });
          }
      return (
        (l = this), u < t.length && s.push({ elem: l, handlers: t.slice(u) }), s
      );
    },
    addProp: function (e, t) {
      Object.defineProperty(w.Event.prototype, e, {
        enumerable: !0,
        configurable: !0,
        get: g(t)
          ? function () {
              if (this.originalEvent) return t(this.originalEvent);
            }
          : function () {
              if (this.originalEvent) return this.originalEvent[e];
            },
        set: function (t) {
          Object.defineProperty(this, e, {
            enumerable: !0,
            configurable: !0,
            writable: !0,
            value: t,
          });
        },
      });
    },
    fix: function (e) {
      return e[w.expando] ? e : new w.Event(e);
    },
    special: {
      load: { noBubble: !0 },
      focus: {
        trigger: function () {
          if (this !== Se() && this.focus) return this.focus(), !1;
        },
        delegateType: "focusin",
      },
      blur: {
        trigger: function () {
          if (this === Se() && this.blur) return this.blur(), !1;
        },
        delegateType: "focusout",
      },
      click: {
        trigger: function () {
          if ("checkbox" === this.type && this.click && N(this, "input"))
            return this.click(), !1;
        },
        _default: function (e) {
          return N(e.target, "a");
        },
      },
      beforeunload: {
        postDispatch: function (e) {
          void 0 !== e.result &&
            e.originalEvent &&
            (e.originalEvent.returnValue = e.result);
        },
      },
    },
  }),
    (w.removeEvent = function (e, t, n) {
      e.removeEventListener && e.removeEventListener(t, n);
    }),
    (w.Event = function (e, t) {
      if (!(this instanceof w.Event)) return new w.Event(e, t);
      e && e.type
        ? ((this.originalEvent = e),
          (this.type = e.type),
          (this.isDefaultPrevented =
            e.defaultPrevented ||
            (void 0 === e.defaultPrevented && !1 === e.returnValue)
              ? Ee
              : ke),
          (this.target =
            e.target && 3 === e.target.nodeType
              ? e.target.parentNode
              : e.target),
          (this.currentTarget = e.currentTarget),
          (this.relatedTarget = e.relatedTarget))
        : (this.type = e),
        t && w.extend(this, t),
        (this.timeStamp = (e && e.timeStamp) || Date.now()),
        (this[w.expando] = !0);
    }),
    (w.Event.prototype = {
      constructor: w.Event,
      isDefaultPrevented: ke,
      isPropagationStopped: ke,
      isImmediatePropagationStopped: ke,
      isSimulated: !1,
      preventDefault: function () {
        var e = this.originalEvent;
        (this.isDefaultPrevented = Ee),
          e && !this.isSimulated && e.preventDefault();
      },
      stopPropagation: function () {
        var e = this.originalEvent;
        (this.isPropagationStopped = Ee),
          e && !this.isSimulated && e.stopPropagation();
      },
      stopImmediatePropagation: function () {
        var e = this.originalEvent;
        (this.isImmediatePropagationStopped = Ee),
          e && !this.isSimulated && e.stopImmediatePropagation(),
          this.stopPropagation();
      },
    }),
    w.each(
      {
        altKey: !0,
        bubbles: !0,
        cancelable: !0,
        changedTouches: !0,
        ctrlKey: !0,
        detail: !0,
        eventPhase: !0,
        metaKey: !0,
        pageX: !0,
        pageY: !0,
        shiftKey: !0,
        view: !0,
        char: !0,
        charCode: !0,
        key: !0,
        keyCode: !0,
        button: !0,
        buttons: !0,
        clientX: !0,
        clientY: !0,
        offsetX: !0,
        offsetY: !0,
        pointerId: !0,
        pointerType: !0,
        screenX: !0,
        screenY: !0,
        targetTouches: !0,
        toElement: !0,
        touches: !0,
        which: function (e) {
          var t = e.button;
          return null == e.which && we.test(e.type)
            ? null != e.charCode
              ? e.charCode
              : e.keyCode
            : !e.which && void 0 !== t && Te.test(e.type)
              ? 1 & t
                ? 1
                : 2 & t
                  ? 3
                  : 4 & t
                    ? 2
                    : 0
              : e.which;
        },
      },
      w.event.addProp
    ),
    w.each(
      {
        mouseenter: "mouseover",
        mouseleave: "mouseout",
        pointerenter: "pointerover",
        pointerleave: "pointerout",
      },
      function (e, t) {
        w.event.special[e] = {
          delegateType: t,
          bindType: t,
          handle: function (e) {
            var n,
              r = this,
              i = e.relatedTarget,
              o = e.handleObj;
            return (
              (i && (i === r || w.contains(r, i))) ||
                ((e.type = o.origType),
                (n = o.handler.apply(this, arguments)),
                (e.type = t)),
              n
            );
          },
        };
      }
    ),
    w.fn.extend({
      on: function (e, t, n, r) {
        return De(this, e, t, n, r);
      },
      one: function (e, t, n, r) {
        return De(this, e, t, n, r, 1);
      },
      off: function (e, t, n) {
        var r, i;
        if (e && e.preventDefault && e.handleObj)
          return (
            (r = e.handleObj),
            w(e.delegateTarget).off(
              r.namespace ? r.origType + "." + r.namespace : r.origType,
              r.selector,
              r.handler
            ),
            this
          );
        if ("object" == typeof e) {
          for (i in e) this.off(i, t, e[i]);
          return this;
        }
        return (
          (!1 !== t && "function" != typeof t) || ((n = t), (t = void 0)),
          !1 === n && (n = ke),
          this.each(function () {
            w.event.remove(this, e, n, t);
          })
        );
      },
    });
  var Ne =
      /<(?!area|br|col|embed|hr|img|input|link|meta|param)(([a-z][^\/\0>\x20\t\r\n\f]*)[^>]*)\/>/gi,
    Ae = /<script|<style|<link/i,
    je = /checked\s*(?:[^=]|=\s*.checked.)/i,
    qe = /^\s*<!(?:\[CDATA\[|--)|(?:\]\]|--)>\s*$/g;
  function Le(e, t) {
    return N(e, "table") && N(11 !== t.nodeType ? t : t.firstChild, "tr")
      ? w(e).children("tbody")[0] || e
      : e;
  }
  function He(e) {
    return (e.type = (null !== e.getAttribute("type")) + "/" + e.type), e;
  }
  function Oe(e) {
    return (
      "true/" === (e.type || "").slice(0, 5)
        ? (e.type = e.type.slice(5))
        : e.removeAttribute("type"),
      e
    );
  }
  function Pe(e, t) {
    var n, r, i, o, a, s, u, l;
    if (1 === t.nodeType) {
      if (
        J.hasData(e) &&
        ((o = J.access(e)), (a = J.set(t, o)), (l = o.events))
      ) {
        delete a.handle, (a.events = {});
        for (i in l)
          for (n = 0, r = l[i].length; n < r; n++) w.event.add(t, i, l[i][n]);
      }
      K.hasData(e) && ((s = K.access(e)), (u = w.extend({}, s)), K.set(t, u));
    }
  }
  function Me(e, t) {
    var n = t.nodeName.toLowerCase();
    "input" === n && pe.test(e.type)
      ? (t.checked = e.checked)
      : ("input" !== n && "textarea" !== n) ||
        (t.defaultValue = e.defaultValue);
  }
  function Re(e, t, n, r) {
    t = a.apply([], t);
    var i,
      o,
      s,
      u,
      l,
      c,
      f = 0,
      p = e.length,
      d = p - 1,
      y = t[0],
      v = g(y);
    if (v || (p > 1 && "string" == typeof y && !h.checkClone && je.test(y)))
      return e.each(function (i) {
        var o = e.eq(i);
        v && (t[0] = y.call(this, i, o.html())), Re(o, t, n, r);
      });
    if (
      p &&
      ((i = xe(t, e[0].ownerDocument, !1, e, r)),
      (o = i.firstChild),
      1 === i.childNodes.length && (i = o),
      o || r)
    ) {
      for (u = (s = w.map(ye(i, "script"), He)).length; f < p; f++)
        (l = i),
          f !== d &&
            ((l = w.clone(l, !0, !0)), u && w.merge(s, ye(l, "script"))),
          n.call(e[f], l, f);
      if (u)
        for (c = s[s.length - 1].ownerDocument, w.map(s, Oe), f = 0; f < u; f++)
          (l = s[f]),
            he.test(l.type || "") &&
              !J.access(l, "globalEval") &&
              w.contains(c, l) &&
              (l.src && "module" !== (l.type || "").toLowerCase()
                ? w._evalUrl && w._evalUrl(l.src)
                : m(l.textContent.replace(qe, ""), c, l));
    }
    return e;
  }
  function Ie(e, t, n) {
    for (var r, i = t ? w.filter(t, e) : e, o = 0; null != (r = i[o]); o++)
      n || 1 !== r.nodeType || w.cleanData(ye(r)),
        r.parentNode &&
          (n && w.contains(r.ownerDocument, r) && ve(ye(r, "script")),
          r.parentNode.removeChild(r));
    return e;
  }
  w.extend({
    htmlPrefilter: function (e) {
      return e.replace(Ne, "<$1></$2>");
    },
    clone: function (e, t, n) {
      var r,
        i,
        o,
        a,
        s = e.cloneNode(!0),
        u = w.contains(e.ownerDocument, e);
      if (
        !(
          h.noCloneChecked ||
          (1 !== e.nodeType && 11 !== e.nodeType) ||
          w.isXMLDoc(e)
        )
      )
        for (a = ye(s), r = 0, i = (o = ye(e)).length; r < i; r++)
          Me(o[r], a[r]);
      if (t)
        if (n)
          for (o = o || ye(e), a = a || ye(s), r = 0, i = o.length; r < i; r++)
            Pe(o[r], a[r]);
        else Pe(e, s);
      return (
        (a = ye(s, "script")).length > 0 && ve(a, !u && ye(e, "script")), s
      );
    },
    cleanData: function (e) {
      for (var t, n, r, i = w.event.special, o = 0; void 0 !== (n = e[o]); o++)
        if (Y(n)) {
          if ((t = n[J.expando])) {
            if (t.events)
              for (r in t.events)
                i[r] ? w.event.remove(n, r) : w.removeEvent(n, r, t.handle);
            n[J.expando] = void 0;
          }
          n[K.expando] && (n[K.expando] = void 0);
        }
    },
  }),
    w.fn.extend({
      detach: function (e) {
        return Ie(this, e, !0);
      },
      remove: function (e) {
        return Ie(this, e);
      },
      text: function (e) {
        return z(
          this,
          function (e) {
            return void 0 === e
              ? w.text(this)
              : this.empty().each(function () {
                  (1 !== this.nodeType &&
                    11 !== this.nodeType &&
                    9 !== this.nodeType) ||
                    (this.textContent = e);
                });
          },
          null,
          e,
          arguments.length
        );
      },
      append: function () {
        return Re(this, arguments, function (e) {
          (1 !== this.nodeType &&
            11 !== this.nodeType &&
            9 !== this.nodeType) ||
            Le(this, e).appendChild(e);
        });
      },
      prepend: function () {
        return Re(this, arguments, function (e) {
          if (
            1 === this.nodeType ||
            11 === this.nodeType ||
            9 === this.nodeType
          ) {
            var t = Le(this, e);
            t.insertBefore(e, t.firstChild);
          }
        });
      },
      before: function () {
        return Re(this, arguments, function (e) {
          this.parentNode && this.parentNode.insertBefore(e, this);
        });
      },
      after: function () {
        return Re(this, arguments, function (e) {
          this.parentNode && this.parentNode.insertBefore(e, this.nextSibling);
        });
      },
      empty: function () {
        for (var e, t = 0; null != (e = this[t]); t++)
          1 === e.nodeType && (w.cleanData(ye(e, !1)), (e.textContent = ""));
        return this;
      },
      clone: function (e, t) {
        return (
          (e = null != e && e),
          (t = null == t ? e : t),
          this.map(function () {
            return w.clone(this, e, t);
          })
        );
      },
      html: function (e) {
        return z(
          this,
          function (e) {
            var t = this[0] || {},
              n = 0,
              r = this.length;
            if (void 0 === e && 1 === t.nodeType) return t.innerHTML;
            if (
              "string" == typeof e &&
              !Ae.test(e) &&
              !ge[(de.exec(e) || ["", ""])[1].toLowerCase()]
            ) {
              e = w.htmlPrefilter(e);
              try {
                for (; n < r; n++)
                  1 === (t = this[n] || {}).nodeType &&
                    (w.cleanData(ye(t, !1)), (t.innerHTML = e));
                t = 0;
              } catch (e) {}
            }
            t && this.empty().append(e);
          },
          null,
          e,
          arguments.length
        );
      },
      replaceWith: function () {
        var e = [];
        return Re(
          this,
          arguments,
          function (t) {
            var n = this.parentNode;
            w.inArray(this, e) < 0 &&
              (w.cleanData(ye(this)), n && n.replaceChild(t, this));
          },
          e
        );
      },
    }),
    w.each(
      {
        appendTo: "append",
        prependTo: "prepend",
        insertBefore: "before",
        insertAfter: "after",
        replaceAll: "replaceWith",
      },
      function (e, t) {
        w.fn[e] = function (e) {
          for (var n, r = [], i = w(e), o = i.length - 1, a = 0; a <= o; a++)
            (n = a === o ? this : this.clone(!0)),
              w(i[a])[t](n),
              s.apply(r, n.get());
          return this.pushStack(r);
        };
      }
    );
  var We = new RegExp("^(" + re + ")(?!px)[a-z%]+$", "i"),
    $e = function (t) {
      var n = t.ownerDocument.defaultView;
      return (n && n.opener) || (n = e), n.getComputedStyle(t);
    },
    Be = new RegExp(oe.join("|"), "i");
  !(function () {
    function t() {
      if (c) {
        (l.style.cssText =
          "position:absolute;left:-11111px;width:60px;margin-top:1px;padding:0;border:0"),
          (c.style.cssText =
            "position:relative;display:block;box-sizing:border-box;overflow:scroll;margin:auto;border:1px;padding:1px;width:60%;top:1%"),
          be.appendChild(l).appendChild(c);
        var t = e.getComputedStyle(c);
        (i = "1%" !== t.top),
          (u = 12 === n(t.marginLeft)),
          (c.style.right = "60%"),
          (s = 36 === n(t.right)),
          (o = 36 === n(t.width)),
          (c.style.position = "absolute"),
          (a = 36 === c.offsetWidth || "absolute"),
          be.removeChild(l),
          (c = null);
      }
    }
    function n(e) {
      return Math.round(parseFloat(e));
    }
    var i,
      o,
      a,
      s,
      u,
      l = r.createElement("div"),
      c = r.createElement("div");
    c.style &&
      ((c.style.backgroundClip = "content-box"),
      (c.cloneNode(!0).style.backgroundClip = ""),
      (h.clearCloneStyle = "content-box" === c.style.backgroundClip),
      w.extend(h, {
        boxSizingReliable: function () {
          return t(), o;
        },
        pixelBoxStyles: function () {
          return t(), s;
        },
        pixelPosition: function () {
          return t(), i;
        },
        reliableMarginLeft: function () {
          return t(), u;
        },
        scrollboxSize: function () {
          return t(), a;
        },
      }));
  })();
  function Fe(e, t, n) {
    var r,
      i,
      o,
      a,
      s = e.style;
    return (
      (n = n || $e(e)) &&
        ("" !== (a = n.getPropertyValue(t) || n[t]) ||
          w.contains(e.ownerDocument, e) ||
          (a = w.style(e, t)),
        !h.pixelBoxStyles() &&
          We.test(a) &&
          Be.test(t) &&
          ((r = s.width),
          (i = s.minWidth),
          (o = s.maxWidth),
          (s.minWidth = s.maxWidth = s.width = a),
          (a = n.width),
          (s.width = r),
          (s.minWidth = i),
          (s.maxWidth = o))),
      void 0 !== a ? a + "" : a
    );
  }
  function _e(e, t) {
    return {
      get: function () {
        if (!e()) return (this.get = t).apply(this, arguments);
        delete this.get;
      },
    };
  }
  var ze = /^(none|table(?!-c[ea]).+)/,
    Xe = /^--/,
    Ue = { position: "absolute", visibility: "hidden", display: "block" },
    Ve = { letterSpacing: "0", fontWeight: "400" },
    Ge = ["Webkit", "Moz", "ms"],
    Ye = r.createElement("div").style;
  function Qe(e) {
    if (e in Ye) return e;
    var t = e[0].toUpperCase() + e.slice(1),
      n = Ge.length;
    while (n--) if ((e = Ge[n] + t) in Ye) return e;
  }
  function Je(e) {
    var t = w.cssProps[e];
    return t || (t = w.cssProps[e] = Qe(e) || e), t;
  }
  function Ke(e, t, n) {
    var r = ie.exec(t);
    return r ? Math.max(0, r[2] - (n || 0)) + (r[3] || "px") : t;
  }
  function Ze(e, t, n, r, i, o) {
    var a = "width" === t ? 1 : 0,
      s = 0,
      u = 0;
    if (n === (r ? "border" : "content")) return 0;
    for (; a < 4; a += 2)
      "margin" === n && (u += w.css(e, n + oe[a], !0, i)),
        r
          ? ("content" === n && (u -= w.css(e, "padding" + oe[a], !0, i)),
            "margin" !== n &&
              (u -= w.css(e, "border" + oe[a] + "Width", !0, i)))
          : ((u += w.css(e, "padding" + oe[a], !0, i)),
            "padding" !== n
              ? (u += w.css(e, "border" + oe[a] + "Width", !0, i))
              : (s += w.css(e, "border" + oe[a] + "Width", !0, i)));
    return (
      !r &&
        o >= 0 &&
        (u += Math.max(
          0,
          Math.ceil(
            e["offset" + t[0].toUpperCase() + t.slice(1)] - o - u - s - 0.5
          )
        )),
      u
    );
  }
  function et(e, t, n) {
    var r = $e(e),
      i = Fe(e, t, r),
      o = "border-box" === w.css(e, "boxSizing", !1, r),
      a = o;
    if (We.test(i)) {
      if (!n) return i;
      i = "auto";
    }
    return (
      (a = a && (h.boxSizingReliable() || i === e.style[t])),
      ("auto" === i ||
        (!parseFloat(i) && "inline" === w.css(e, "display", !1, r))) &&
        ((i = e["offset" + t[0].toUpperCase() + t.slice(1)]), (a = !0)),
      (i = parseFloat(i) || 0) +
        Ze(e, t, n || (o ? "border" : "content"), a, r, i) +
        "px"
    );
  }
  w.extend({
    cssHooks: {
      opacity: {
        get: function (e, t) {
          if (t) {
            var n = Fe(e, "opacity");
            return "" === n ? "1" : n;
          }
        },
      },
    },
    cssNumber: {
      animationIterationCount: !0,
      columnCount: !0,
      fillOpacity: !0,
      flexGrow: !0,
      flexShrink: !0,
      fontWeight: !0,
      lineHeight: !0,
      opacity: !0,
      order: !0,
      orphans: !0,
      widows: !0,
      zIndex: !0,
      zoom: !0,
    },
    cssProps: {},
    style: function (e, t, n, r) {
      if (e && 3 !== e.nodeType && 8 !== e.nodeType && e.style) {
        var i,
          o,
          a,
          s = G(t),
          u = Xe.test(t),
          l = e.style;
        if (
          (u || (t = Je(s)), (a = w.cssHooks[t] || w.cssHooks[s]), void 0 === n)
        )
          return a && "get" in a && void 0 !== (i = a.get(e, !1, r)) ? i : l[t];
        "string" == (o = typeof n) &&
          (i = ie.exec(n)) &&
          i[1] &&
          ((n = ue(e, t, i)), (o = "number")),
          null != n &&
            n === n &&
            ("number" === o &&
              (n += (i && i[3]) || (w.cssNumber[s] ? "" : "px")),
            h.clearCloneStyle ||
              "" !== n ||
              0 !== t.indexOf("background") ||
              (l[t] = "inherit"),
            (a && "set" in a && void 0 === (n = a.set(e, n, r))) ||
              (u ? l.setProperty(t, n) : (l[t] = n)));
      }
    },
    css: function (e, t, n, r) {
      var i,
        o,
        a,
        s = G(t);
      return (
        Xe.test(t) || (t = Je(s)),
        (a = w.cssHooks[t] || w.cssHooks[s]) &&
          "get" in a &&
          (i = a.get(e, !0, n)),
        void 0 === i && (i = Fe(e, t, r)),
        "normal" === i && t in Ve && (i = Ve[t]),
        "" === n || n
          ? ((o = parseFloat(i)), !0 === n || isFinite(o) ? o || 0 : i)
          : i
      );
    },
  }),
    w.each(["height", "width"], function (e, t) {
      w.cssHooks[t] = {
        get: function (e, n, r) {
          if (n)
            return !ze.test(w.css(e, "display")) ||
              (e.getClientRects().length && e.getBoundingClientRect().width)
              ? et(e, t, r)
              : se(e, Ue, function () {
                  return et(e, t, r);
                });
        },
        set: function (e, n, r) {
          var i,
            o = $e(e),
            a = "border-box" === w.css(e, "boxSizing", !1, o),
            s = r && Ze(e, t, r, a, o);
          return (
            a &&
              h.scrollboxSize() === o.position &&
              (s -= Math.ceil(
                e["offset" + t[0].toUpperCase() + t.slice(1)] -
                  parseFloat(o[t]) -
                  Ze(e, t, "border", !1, o) -
                  0.5
              )),
            s &&
              (i = ie.exec(n)) &&
              "px" !== (i[3] || "px") &&
              ((e.style[t] = n), (n = w.css(e, t))),
            Ke(e, n, s)
          );
        },
      };
    }),
    (w.cssHooks.marginLeft = _e(h.reliableMarginLeft, function (e, t) {
      if (t)
        return (
          (parseFloat(Fe(e, "marginLeft")) ||
            e.getBoundingClientRect().left -
              se(e, { marginLeft: 0 }, function () {
                return e.getBoundingClientRect().left;
              })) + "px"
        );
    })),
    w.each({ margin: "", padding: "", border: "Width" }, function (e, t) {
      (w.cssHooks[e + t] = {
        expand: function (n) {
          for (
            var r = 0, i = {}, o = "string" == typeof n ? n.split(" ") : [n];
            r < 4;
            r++
          )
            i[e + oe[r] + t] = o[r] || o[r - 2] || o[0];
          return i;
        },
      }),
        "margin" !== e && (w.cssHooks[e + t].set = Ke);
    }),
    w.fn.extend({
      css: function (e, t) {
        return z(
          this,
          function (e, t, n) {
            var r,
              i,
              o = {},
              a = 0;
            if (Array.isArray(t)) {
              for (r = $e(e), i = t.length; a < i; a++)
                o[t[a]] = w.css(e, t[a], !1, r);
              return o;
            }
            return void 0 !== n ? w.style(e, t, n) : w.css(e, t);
          },
          e,
          t,
          arguments.length > 1
        );
      },
    });
  function tt(e, t, n, r, i) {
    return new tt.prototype.init(e, t, n, r, i);
  }
  (w.Tween = tt),
    (tt.prototype = {
      constructor: tt,
      init: function (e, t, n, r, i, o) {
        (this.elem = e),
          (this.prop = n),
          (this.easing = i || w.easing._default),
          (this.options = t),
          (this.start = this.now = this.cur()),
          (this.end = r),
          (this.unit = o || (w.cssNumber[n] ? "" : "px"));
      },
      cur: function () {
        var e = tt.propHooks[this.prop];
        return e && e.get ? e.get(this) : tt.propHooks._default.get(this);
      },
      run: function (e) {
        var t,
          n = tt.propHooks[this.prop];
        return (
          this.options.duration
            ? (this.pos = t =
                w.easing[this.easing](
                  e,
                  this.options.duration * e,
                  0,
                  1,
                  this.options.duration
                ))
            : (this.pos = t = e),
          (this.now = (this.end - this.start) * t + this.start),
          this.options.step &&
            this.options.step.call(this.elem, this.now, this),
          n && n.set ? n.set(this) : tt.propHooks._default.set(this),
          this
        );
      },
    }),
    (tt.prototype.init.prototype = tt.prototype),
    (tt.propHooks = {
      _default: {
        get: function (e) {
          var t;
          return 1 !== e.elem.nodeType ||
            (null != e.elem[e.prop] && null == e.elem.style[e.prop])
            ? e.elem[e.prop]
            : (t = w.css(e.elem, e.prop, "")) && "auto" !== t
              ? t
              : 0;
        },
        set: function (e) {
          w.fx.step[e.prop]
            ? w.fx.step[e.prop](e)
            : 1 !== e.elem.nodeType ||
                (null == e.elem.style[w.cssProps[e.prop]] &&
                  !w.cssHooks[e.prop])
              ? (e.elem[e.prop] = e.now)
              : w.style(e.elem, e.prop, e.now + e.unit);
        },
      },
    }),
    (tt.propHooks.scrollTop = tt.propHooks.scrollLeft =
      {
        set: function (e) {
          e.elem.nodeType && e.elem.parentNode && (e.elem[e.prop] = e.now);
        },
      }),
    (w.easing = {
      linear: function (e) {
        return e;
      },
      swing: function (e) {
        return 0.5 - Math.cos(e * Math.PI) / 2;
      },
      _default: "swing",
    }),
    (w.fx = tt.prototype.init),
    (w.fx.step = {});
  var nt,
    rt,
    it = /^(?:toggle|show|hide)$/,
    ot = /queueHooks$/;
  function at() {
    rt &&
      (!1 === r.hidden && e.requestAnimationFrame
        ? e.requestAnimationFrame(at)
        : e.setTimeout(at, w.fx.interval),
      w.fx.tick());
  }
  function st() {
    return (
      e.setTimeout(function () {
        nt = void 0;
      }),
      (nt = Date.now())
    );
  }
  function ut(e, t) {
    var n,
      r = 0,
      i = { height: e };
    for (t = t ? 1 : 0; r < 4; r += 2 - t)
      i["margin" + (n = oe[r])] = i["padding" + n] = e;
    return t && (i.opacity = i.width = e), i;
  }
  function lt(e, t, n) {
    for (
      var r,
        i = (pt.tweeners[t] || []).concat(pt.tweeners["*"]),
        o = 0,
        a = i.length;
      o < a;
      o++
    )
      if ((r = i[o].call(n, t, e))) return r;
  }
  function ct(e, t, n) {
    var r,
      i,
      o,
      a,
      s,
      u,
      l,
      c,
      f = "width" in t || "height" in t,
      p = this,
      d = {},
      h = e.style,
      g = e.nodeType && ae(e),
      y = J.get(e, "fxshow");
    n.queue ||
      (null == (a = w._queueHooks(e, "fx")).unqueued &&
        ((a.unqueued = 0),
        (s = a.empty.fire),
        (a.empty.fire = function () {
          a.unqueued || s();
        })),
      a.unqueued++,
      p.always(function () {
        p.always(function () {
          a.unqueued--, w.queue(e, "fx").length || a.empty.fire();
        });
      }));
    for (r in t)
      if (((i = t[r]), it.test(i))) {
        if (
          (delete t[r], (o = o || "toggle" === i), i === (g ? "hide" : "show"))
        ) {
          if ("show" !== i || !y || void 0 === y[r]) continue;
          g = !0;
        }
        d[r] = (y && y[r]) || w.style(e, r);
      }
    if ((u = !w.isEmptyObject(t)) || !w.isEmptyObject(d)) {
      f &&
        1 === e.nodeType &&
        ((n.overflow = [h.overflow, h.overflowX, h.overflowY]),
        null == (l = y && y.display) && (l = J.get(e, "display")),
        "none" === (c = w.css(e, "display")) &&
          (l
            ? (c = l)
            : (fe([e], !0),
              (l = e.style.display || l),
              (c = w.css(e, "display")),
              fe([e]))),
        ("inline" === c || ("inline-block" === c && null != l)) &&
          "none" === w.css(e, "float") &&
          (u ||
            (p.done(function () {
              h.display = l;
            }),
            null == l && ((c = h.display), (l = "none" === c ? "" : c))),
          (h.display = "inline-block"))),
        n.overflow &&
          ((h.overflow = "hidden"),
          p.always(function () {
            (h.overflow = n.overflow[0]),
              (h.overflowX = n.overflow[1]),
              (h.overflowY = n.overflow[2]);
          })),
        (u = !1);
      for (r in d)
        u ||
          (y
            ? "hidden" in y && (g = y.hidden)
            : (y = J.access(e, "fxshow", { display: l })),
          o && (y.hidden = !g),
          g && fe([e], !0),
          p.done(function () {
            g || fe([e]), J.remove(e, "fxshow");
            for (r in d) w.style(e, r, d[r]);
          })),
          (u = lt(g ? y[r] : 0, r, p)),
          r in y || ((y[r] = u.start), g && ((u.end = u.start), (u.start = 0)));
    }
  }
  function ft(e, t) {
    var n, r, i, o, a;
    for (n in e)
      if (
        ((r = G(n)),
        (i = t[r]),
        (o = e[n]),
        Array.isArray(o) && ((i = o[1]), (o = e[n] = o[0])),
        n !== r && ((e[r] = o), delete e[n]),
        (a = w.cssHooks[r]) && "expand" in a)
      ) {
        (o = a.expand(o)), delete e[r];
        for (n in o) n in e || ((e[n] = o[n]), (t[n] = i));
      } else t[r] = i;
  }
  function pt(e, t, n) {
    var r,
      i,
      o = 0,
      a = pt.prefilters.length,
      s = w.Deferred().always(function () {
        delete u.elem;
      }),
      u = function () {
        if (i) return !1;
        for (
          var t = nt || st(),
            n = Math.max(0, l.startTime + l.duration - t),
            r = 1 - (n / l.duration || 0),
            o = 0,
            a = l.tweens.length;
          o < a;
          o++
        )
          l.tweens[o].run(r);
        return (
          s.notifyWith(e, [l, r, n]),
          r < 1 && a
            ? n
            : (a || s.notifyWith(e, [l, 1, 0]), s.resolveWith(e, [l]), !1)
        );
      },
      l = s.promise({
        elem: e,
        props: w.extend({}, t),
        opts: w.extend(!0, { specialEasing: {}, easing: w.easing._default }, n),
        originalProperties: t,
        originalOptions: n,
        startTime: nt || st(),
        duration: n.duration,
        tweens: [],
        createTween: function (t, n) {
          var r = w.Tween(
            e,
            l.opts,
            t,
            n,
            l.opts.specialEasing[t] || l.opts.easing
          );
          return l.tweens.push(r), r;
        },
        stop: function (t) {
          var n = 0,
            r = t ? l.tweens.length : 0;
          if (i) return this;
          for (i = !0; n < r; n++) l.tweens[n].run(1);
          return (
            t
              ? (s.notifyWith(e, [l, 1, 0]), s.resolveWith(e, [l, t]))
              : s.rejectWith(e, [l, t]),
            this
          );
        },
      }),
      c = l.props;
    for (ft(c, l.opts.specialEasing); o < a; o++)
      if ((r = pt.prefilters[o].call(l, e, c, l.opts)))
        return (
          g(r.stop) &&
            (w._queueHooks(l.elem, l.opts.queue).stop = r.stop.bind(r)),
          r
        );
    return (
      w.map(c, lt, l),
      g(l.opts.start) && l.opts.start.call(e, l),
      l
        .progress(l.opts.progress)
        .done(l.opts.done, l.opts.complete)
        .fail(l.opts.fail)
        .always(l.opts.always),
      w.fx.timer(w.extend(u, { elem: e, anim: l, queue: l.opts.queue })),
      l
    );
  }
  (w.Animation = w.extend(pt, {
    tweeners: {
      "*": [
        function (e, t) {
          var n = this.createTween(e, t);
          return ue(n.elem, e, ie.exec(t), n), n;
        },
      ],
    },
    tweener: function (e, t) {
      g(e) ? ((t = e), (e = ["*"])) : (e = e.match(M));
      for (var n, r = 0, i = e.length; r < i; r++)
        (n = e[r]),
          (pt.tweeners[n] = pt.tweeners[n] || []),
          pt.tweeners[n].unshift(t);
    },
    prefilters: [ct],
    prefilter: function (e, t) {
      t ? pt.prefilters.unshift(e) : pt.prefilters.push(e);
    },
  })),
    (w.speed = function (e, t, n) {
      var r =
        e && "object" == typeof e
          ? w.extend({}, e)
          : {
              complete: n || (!n && t) || (g(e) && e),
              duration: e,
              easing: (n && t) || (t && !g(t) && t),
            };
      return (
        w.fx.off
          ? (r.duration = 0)
          : "number" != typeof r.duration &&
            (r.duration in w.fx.speeds
              ? (r.duration = w.fx.speeds[r.duration])
              : (r.duration = w.fx.speeds._default)),
        (null != r.queue && !0 !== r.queue) || (r.queue = "fx"),
        (r.old = r.complete),
        (r.complete = function () {
          g(r.old) && r.old.call(this), r.queue && w.dequeue(this, r.queue);
        }),
        r
      );
    }),
    w.fn.extend({
      fadeTo: function (e, t, n, r) {
        return this.filter(ae)
          .css("opacity", 0)
          .show()
          .end()
          .animate({ opacity: t }, e, n, r);
      },
      animate: function (e, t, n, r) {
        var i = w.isEmptyObject(e),
          o = w.speed(t, n, r),
          a = function () {
            var t = pt(this, w.extend({}, e), o);
            (i || J.get(this, "finish")) && t.stop(!0);
          };
        return (
          (a.finish = a),
          i || !1 === o.queue ? this.each(a) : this.queue(o.queue, a)
        );
      },
      stop: function (e, t, n) {
        var r = function (e) {
          var t = e.stop;
          delete e.stop, t(n);
        };
        return (
          "string" != typeof e && ((n = t), (t = e), (e = void 0)),
          t && !1 !== e && this.queue(e || "fx", []),
          this.each(function () {
            var t = !0,
              i = null != e && e + "queueHooks",
              o = w.timers,
              a = J.get(this);
            if (i) a[i] && a[i].stop && r(a[i]);
            else for (i in a) a[i] && a[i].stop && ot.test(i) && r(a[i]);
            for (i = o.length; i--; )
              o[i].elem !== this ||
                (null != e && o[i].queue !== e) ||
                (o[i].anim.stop(n), (t = !1), o.splice(i, 1));
            (!t && n) || w.dequeue(this, e);
          })
        );
      },
      finish: function (e) {
        return (
          !1 !== e && (e = e || "fx"),
          this.each(function () {
            var t,
              n = J.get(this),
              r = n[e + "queue"],
              i = n[e + "queueHooks"],
              o = w.timers,
              a = r ? r.length : 0;
            for (
              n.finish = !0,
                w.queue(this, e, []),
                i && i.stop && i.stop.call(this, !0),
                t = o.length;
              t--;

            )
              o[t].elem === this &&
                o[t].queue === e &&
                (o[t].anim.stop(!0), o.splice(t, 1));
            for (t = 0; t < a; t++)
              r[t] && r[t].finish && r[t].finish.call(this);
            delete n.finish;
          })
        );
      },
    }),
    w.each(["toggle", "show", "hide"], function (e, t) {
      var n = w.fn[t];
      w.fn[t] = function (e, r, i) {
        return null == e || "boolean" == typeof e
          ? n.apply(this, arguments)
          : this.animate(ut(t, !0), e, r, i);
      };
    }),
    w.each(
      {
        slideDown: ut("show"),
        slideUp: ut("hide"),
        slideToggle: ut("toggle"),
        fadeIn: { opacity: "show" },
        fadeOut: { opacity: "hide" },
        fadeToggle: { opacity: "toggle" },
      },
      function (e, t) {
        w.fn[e] = function (e, n, r) {
          return this.animate(t, e, n, r);
        };
      }
    ),
    (w.timers = []),
    (w.fx.tick = function () {
      var e,
        t = 0,
        n = w.timers;
      for (nt = Date.now(); t < n.length; t++)
        (e = n[t])() || n[t] !== e || n.splice(t--, 1);
      n.length || w.fx.stop(), (nt = void 0);
    }),
    (w.fx.timer = function (e) {
      w.timers.push(e), w.fx.start();
    }),
    (w.fx.interval = 13),
    (w.fx.start = function () {
      rt || ((rt = !0), at());
    }),
    (w.fx.stop = function () {
      rt = null;
    }),
    (w.fx.speeds = { slow: 600, fast: 200, _default: 400 }),
    (w.fn.delay = function (t, n) {
      return (
        (t = w.fx ? w.fx.speeds[t] || t : t),
        (n = n || "fx"),
        this.queue(n, function (n, r) {
          var i = e.setTimeout(n, t);
          r.stop = function () {
            e.clearTimeout(i);
          };
        })
      );
    }),
    (function () {
      var e = r.createElement("input"),
        t = r.createElement("select").appendChild(r.createElement("option"));
      (e.type = "checkbox"),
        (h.checkOn = "" !== e.value),
        (h.optSelected = t.selected),
        ((e = r.createElement("input")).value = "t"),
        (e.type = "radio"),
        (h.radioValue = "t" === e.value);
    })();
  var dt,
    ht = w.expr.attrHandle;
  w.fn.extend({
    attr: function (e, t) {
      return z(this, w.attr, e, t, arguments.length > 1);
    },
    removeAttr: function (e) {
      return this.each(function () {
        w.removeAttr(this, e);
      });
    },
  }),
    w.extend({
      attr: function (e, t, n) {
        var r,
          i,
          o = e.nodeType;
        if (3 !== o && 8 !== o && 2 !== o)
          return "undefined" == typeof e.getAttribute
            ? w.prop(e, t, n)
            : ((1 === o && w.isXMLDoc(e)) ||
                (i =
                  w.attrHooks[t.toLowerCase()] ||
                  (w.expr.match.bool.test(t) ? dt : void 0)),
              void 0 !== n
                ? null === n
                  ? void w.removeAttr(e, t)
                  : i && "set" in i && void 0 !== (r = i.set(e, n, t))
                    ? r
                    : (e.setAttribute(t, n + ""), n)
                : i && "get" in i && null !== (r = i.get(e, t))
                  ? r
                  : null == (r = w.find.attr(e, t))
                    ? void 0
                    : r);
      },
      attrHooks: {
        type: {
          set: function (e, t) {
            if (!h.radioValue && "radio" === t && N(e, "input")) {
              var n = e.value;
              return e.setAttribute("type", t), n && (e.value = n), t;
            }
          },
        },
      },
      removeAttr: function (e, t) {
        var n,
          r = 0,
          i = t && t.match(M);
        if (i && 1 === e.nodeType) while ((n = i[r++])) e.removeAttribute(n);
      },
    }),
    (dt = {
      set: function (e, t, n) {
        return !1 === t ? w.removeAttr(e, n) : e.setAttribute(n, n), n;
      },
    }),
    w.each(w.expr.match.bool.source.match(/\w+/g), function (e, t) {
      var n = ht[t] || w.find.attr;
      ht[t] = function (e, t, r) {
        var i,
          o,
          a = t.toLowerCase();
        return (
          r ||
            ((o = ht[a]),
            (ht[a] = i),
            (i = null != n(e, t, r) ? a : null),
            (ht[a] = o)),
          i
        );
      };
    });
  var gt = /^(?:input|select|textarea|button)$/i,
    yt = /^(?:a|area)$/i;
  w.fn.extend({
    prop: function (e, t) {
      return z(this, w.prop, e, t, arguments.length > 1);
    },
    removeProp: function (e) {
      return this.each(function () {
        delete this[w.propFix[e] || e];
      });
    },
  }),
    w.extend({
      prop: function (e, t, n) {
        var r,
          i,
          o = e.nodeType;
        if (3 !== o && 8 !== o && 2 !== o)
          return (
            (1 === o && w.isXMLDoc(e)) ||
              ((t = w.propFix[t] || t), (i = w.propHooks[t])),
            void 0 !== n
              ? i && "set" in i && void 0 !== (r = i.set(e, n, t))
                ? r
                : (e[t] = n)
              : i && "get" in i && null !== (r = i.get(e, t))
                ? r
                : e[t]
          );
      },
      propHooks: {
        tabIndex: {
          get: function (e) {
            var t = w.find.attr(e, "tabindex");
            return t
              ? parseInt(t, 10)
              : gt.test(e.nodeName) || (yt.test(e.nodeName) && e.href)
                ? 0
                : -1;
          },
        },
      },
      propFix: { for: "htmlFor", class: "className" },
    }),
    h.optSelected ||
      (w.propHooks.selected = {
        get: function (e) {
          var t = e.parentNode;
          return t && t.parentNode && t.parentNode.selectedIndex, null;
        },
        set: function (e) {
          var t = e.parentNode;
          t && (t.selectedIndex, t.parentNode && t.parentNode.selectedIndex);
        },
      }),
    w.each(
      [
        "tabIndex",
        "readOnly",
        "maxLength",
        "cellSpacing",
        "cellPadding",
        "rowSpan",
        "colSpan",
        "useMap",
        "frameBorder",
        "contentEditable",
      ],
      function () {
        w.propFix[this.toLowerCase()] = this;
      }
    );
  function vt(e) {
    return (e.match(M) || []).join(" ");
  }
  function mt(e) {
    return (e.getAttribute && e.getAttribute("class")) || "";
  }
  function xt(e) {
    return Array.isArray(e) ? e : "string" == typeof e ? e.match(M) || [] : [];
  }
  w.fn.extend({
    addClass: function (e) {
      var t,
        n,
        r,
        i,
        o,
        a,
        s,
        u = 0;
      if (g(e))
        return this.each(function (t) {
          w(this).addClass(e.call(this, t, mt(this)));
        });
      if ((t = xt(e)).length)
        while ((n = this[u++]))
          if (((i = mt(n)), (r = 1 === n.nodeType && " " + vt(i) + " "))) {
            a = 0;
            while ((o = t[a++])) r.indexOf(" " + o + " ") < 0 && (r += o + " ");
            i !== (s = vt(r)) && n.setAttribute("class", s);
          }
      return this;
    },
    removeClass: function (e) {
      var t,
        n,
        r,
        i,
        o,
        a,
        s,
        u = 0;
      if (g(e))
        return this.each(function (t) {
          w(this).removeClass(e.call(this, t, mt(this)));
        });
      if (!arguments.length) return this.attr("class", "");
      if ((t = xt(e)).length)
        while ((n = this[u++]))
          if (((i = mt(n)), (r = 1 === n.nodeType && " " + vt(i) + " "))) {
            a = 0;
            while ((o = t[a++]))
              while (r.indexOf(" " + o + " ") > -1)
                r = r.replace(" " + o + " ", " ");
            i !== (s = vt(r)) && n.setAttribute("class", s);
          }
      return this;
    },
    toggleClass: function (e, t) {
      var n = typeof e,
        r = "string" === n || Array.isArray(e);
      return "boolean" == typeof t && r
        ? t
          ? this.addClass(e)
          : this.removeClass(e)
        : g(e)
          ? this.each(function (n) {
              w(this).toggleClass(e.call(this, n, mt(this), t), t);
            })
          : this.each(function () {
              var t, i, o, a;
              if (r) {
                (i = 0), (o = w(this)), (a = xt(e));
                while ((t = a[i++]))
                  o.hasClass(t) ? o.removeClass(t) : o.addClass(t);
              } else
                (void 0 !== e && "boolean" !== n) ||
                  ((t = mt(this)) && J.set(this, "__className__", t),
                  this.setAttribute &&
                    this.setAttribute(
                      "class",
                      t || !1 === e ? "" : J.get(this, "__className__") || ""
                    ));
            });
    },
    hasClass: function (e) {
      var t,
        n,
        r = 0;
      t = " " + e + " ";
      while ((n = this[r++]))
        if (1 === n.nodeType && (" " + vt(mt(n)) + " ").indexOf(t) > -1)
          return !0;
      return !1;
    },
  });
  var bt = /\r/g;
  w.fn.extend({
    val: function (e) {
      var t,
        n,
        r,
        i = this[0];
      {
        if (arguments.length)
          return (
            (r = g(e)),
            this.each(function (n) {
              var i;
              1 === this.nodeType &&
                (null == (i = r ? e.call(this, n, w(this).val()) : e)
                  ? (i = "")
                  : "number" == typeof i
                    ? (i += "")
                    : Array.isArray(i) &&
                      (i = w.map(i, function (e) {
                        return null == e ? "" : e + "";
                      })),
                ((t =
                  w.valHooks[this.type] ||
                  w.valHooks[this.nodeName.toLowerCase()]) &&
                  "set" in t &&
                  void 0 !== t.set(this, i, "value")) ||
                  (this.value = i));
            })
          );
        if (i)
          return (t =
            w.valHooks[i.type] || w.valHooks[i.nodeName.toLowerCase()]) &&
            "get" in t &&
            void 0 !== (n = t.get(i, "value"))
            ? n
            : "string" == typeof (n = i.value)
              ? n.replace(bt, "")
              : null == n
                ? ""
                : n;
      }
    },
  }),
    w.extend({
      valHooks: {
        option: {
          get: function (e) {
            var t = w.find.attr(e, "value");
            return null != t ? t : vt(w.text(e));
          },
        },
        select: {
          get: function (e) {
            var t,
              n,
              r,
              i = e.options,
              o = e.selectedIndex,
              a = "select-one" === e.type,
              s = a ? null : [],
              u = a ? o + 1 : i.length;
            for (r = o < 0 ? u : a ? o : 0; r < u; r++)
              if (
                ((n = i[r]).selected || r === o) &&
                !n.disabled &&
                (!n.parentNode.disabled || !N(n.parentNode, "optgroup"))
              ) {
                if (((t = w(n).val()), a)) return t;
                s.push(t);
              }
            return s;
          },
          set: function (e, t) {
            var n,
              r,
              i = e.options,
              o = w.makeArray(t),
              a = i.length;
            while (a--)
              ((r = i[a]).selected =
                w.inArray(w.valHooks.option.get(r), o) > -1) && (n = !0);
            return n || (e.selectedIndex = -1), o;
          },
        },
      },
    }),
    w.each(["radio", "checkbox"], function () {
      (w.valHooks[this] = {
        set: function (e, t) {
          if (Array.isArray(t))
            return (e.checked = w.inArray(w(e).val(), t) > -1);
        },
      }),
        h.checkOn ||
          (w.valHooks[this].get = function (e) {
            return null === e.getAttribute("value") ? "on" : e.value;
          });
    }),
    (h.focusin = "onfocusin" in e);
  var wt = /^(?:focusinfocus|focusoutblur)$/,
    Tt = function (e) {
      e.stopPropagation();
    };
  w.extend(w.event, {
    trigger: function (t, n, i, o) {
      var a,
        s,
        u,
        l,
        c,
        p,
        d,
        h,
        v = [i || r],
        m = f.call(t, "type") ? t.type : t,
        x = f.call(t, "namespace") ? t.namespace.split(".") : [];
      if (
        ((s = h = u = i = i || r),
        3 !== i.nodeType &&
          8 !== i.nodeType &&
          !wt.test(m + w.event.triggered) &&
          (m.indexOf(".") > -1 && ((m = (x = m.split(".")).shift()), x.sort()),
          (c = m.indexOf(":") < 0 && "on" + m),
          (t = t[w.expando] ? t : new w.Event(m, "object" == typeof t && t)),
          (t.isTrigger = o ? 2 : 3),
          (t.namespace = x.join(".")),
          (t.rnamespace = t.namespace
            ? new RegExp("(^|\\.)" + x.join("\\.(?:.*\\.|)") + "(\\.|$)")
            : null),
          (t.result = void 0),
          t.target || (t.target = i),
          (n = null == n ? [t] : w.makeArray(n, [t])),
          (d = w.event.special[m] || {}),
          o || !d.trigger || !1 !== d.trigger.apply(i, n)))
      ) {
        if (!o && !d.noBubble && !y(i)) {
          for (
            l = d.delegateType || m, wt.test(l + m) || (s = s.parentNode);
            s;
            s = s.parentNode
          )
            v.push(s), (u = s);
          u === (i.ownerDocument || r) &&
            v.push(u.defaultView || u.parentWindow || e);
        }
        a = 0;
        while ((s = v[a++]) && !t.isPropagationStopped())
          (h = s),
            (t.type = a > 1 ? l : d.bindType || m),
            (p = (J.get(s, "events") || {})[t.type] && J.get(s, "handle")) &&
              p.apply(s, n),
            (p = c && s[c]) &&
              p.apply &&
              Y(s) &&
              ((t.result = p.apply(s, n)),
              !1 === t.result && t.preventDefault());
        return (
          (t.type = m),
          o ||
            t.isDefaultPrevented() ||
            (d._default && !1 !== d._default.apply(v.pop(), n)) ||
            !Y(i) ||
            (c &&
              g(i[m]) &&
              !y(i) &&
              ((u = i[c]) && (i[c] = null),
              (w.event.triggered = m),
              t.isPropagationStopped() && h.addEventListener(m, Tt),
              i[m](),
              t.isPropagationStopped() && h.removeEventListener(m, Tt),
              (w.event.triggered = void 0),
              u && (i[c] = u))),
          t.result
        );
      }
    },
    simulate: function (e, t, n) {
      var r = w.extend(new w.Event(), n, { type: e, isSimulated: !0 });
      w.event.trigger(r, null, t);
    },
  }),
    w.fn.extend({
      trigger: function (e, t) {
        return this.each(function () {
          w.event.trigger(e, t, this);
        });
      },
      triggerHandler: function (e, t) {
        var n = this[0];
        if (n) return w.event.trigger(e, t, n, !0);
      },
    }),
    h.focusin ||
      w.each({ focus: "focusin", blur: "focusout" }, function (e, t) {
        var n = function (e) {
          w.event.simulate(t, e.target, w.event.fix(e));
        };
        w.event.special[t] = {
          setup: function () {
            var r = this.ownerDocument || this,
              i = J.access(r, t);
            i || r.addEventListener(e, n, !0), J.access(r, t, (i || 0) + 1);
          },
          teardown: function () {
            var r = this.ownerDocument || this,
              i = J.access(r, t) - 1;
            i
              ? J.access(r, t, i)
              : (r.removeEventListener(e, n, !0), J.remove(r, t));
          },
        };
      });
  var Ct = e.location,
    Et = Date.now(),
    kt = /\?/;
  w.parseXML = function (t) {
    var n;
    if (!t || "string" != typeof t) return null;
    try {
      n = new e.DOMParser().parseFromString(t, "text/xml");
    } catch (e) {
      n = void 0;
    }
    return (
      (n && !n.getElementsByTagName("parsererror").length) ||
        w.error("Invalid XML: " + t),
      n
    );
  };
  var St = /\[\]$/,
    Dt = /\r?\n/g,
    Nt = /^(?:submit|button|image|reset|file)$/i,
    At = /^(?:input|select|textarea|keygen)/i;
  function jt(e, t, n, r) {
    var i;
    if (Array.isArray(t))
      w.each(t, function (t, i) {
        n || St.test(e)
          ? r(e, i)
          : jt(
              e + "[" + ("object" == typeof i && null != i ? t : "") + "]",
              i,
              n,
              r
            );
      });
    else if (n || "object" !== x(t)) r(e, t);
    else for (i in t) jt(e + "[" + i + "]", t[i], n, r);
  }
  (w.param = function (e, t) {
    var n,
      r = [],
      i = function (e, t) {
        var n = g(t) ? t() : t;
        r[r.length] =
          encodeURIComponent(e) + "=" + encodeURIComponent(null == n ? "" : n);
      };
    if (Array.isArray(e) || (e.jquery && !w.isPlainObject(e)))
      w.each(e, function () {
        i(this.name, this.value);
      });
    else for (n in e) jt(n, e[n], t, i);
    return r.join("&");
  }),
    w.fn.extend({
      serialize: function () {
        return w.param(this.serializeArray());
      },
      serializeArray: function () {
        return this.map(function () {
          var e = w.prop(this, "elements");
          return e ? w.makeArray(e) : this;
        })
          .filter(function () {
            var e = this.type;
            return (
              this.name &&
              !w(this).is(":disabled") &&
              At.test(this.nodeName) &&
              !Nt.test(e) &&
              (this.checked || !pe.test(e))
            );
          })
          .map(function (e, t) {
            var n = w(this).val();
            return null == n
              ? null
              : Array.isArray(n)
                ? w.map(n, function (e) {
                    return { name: t.name, value: e.replace(Dt, "\r\n") };
                  })
                : { name: t.name, value: n.replace(Dt, "\r\n") };
          })
          .get();
      },
    });
  var qt = /%20/g,
    Lt = /#.*$/,
    Ht = /([?&])_=[^&]*/,
    Ot = /^(.*?):[ \t]*([^\r\n]*)$/gm,
    Pt = /^(?:about|app|app-storage|.+-extension|file|res|widget):$/,
    Mt = /^(?:GET|HEAD)$/,
    Rt = /^\/\//,
    It = {},
    Wt = {},
    $t = "*/".concat("*"),
    Bt = r.createElement("a");
  Bt.href = Ct.href;
  function Ft(e) {
    return function (t, n) {
      "string" != typeof t && ((n = t), (t = "*"));
      var r,
        i = 0,
        o = t.toLowerCase().match(M) || [];
      if (g(n))
        while ((r = o[i++]))
          "+" === r[0]
            ? ((r = r.slice(1) || "*"), (e[r] = e[r] || []).unshift(n))
            : (e[r] = e[r] || []).push(n);
    };
  }
  function _t(e, t, n, r) {
    var i = {},
      o = e === Wt;
    function a(s) {
      var u;
      return (
        (i[s] = !0),
        w.each(e[s] || [], function (e, s) {
          var l = s(t, n, r);
          return "string" != typeof l || o || i[l]
            ? o
              ? !(u = l)
              : void 0
            : (t.dataTypes.unshift(l), a(l), !1);
        }),
        u
      );
    }
    return a(t.dataTypes[0]) || (!i["*"] && a("*"));
  }
  function zt(e, t) {
    var n,
      r,
      i = w.ajaxSettings.flatOptions || {};
    for (n in t) void 0 !== t[n] && ((i[n] ? e : r || (r = {}))[n] = t[n]);
    return r && w.extend(!0, e, r), e;
  }
  function Xt(e, t, n) {
    var r,
      i,
      o,
      a,
      s = e.contents,
      u = e.dataTypes;
    while ("*" === u[0])
      u.shift(),
        void 0 === r && (r = e.mimeType || t.getResponseHeader("Content-Type"));
    if (r)
      for (i in s)
        if (s[i] && s[i].test(r)) {
          u.unshift(i);
          break;
        }
    if (u[0] in n) o = u[0];
    else {
      for (i in n) {
        if (!u[0] || e.converters[i + " " + u[0]]) {
          o = i;
          break;
        }
        a || (a = i);
      }
      o = o || a;
    }
    if (o) return o !== u[0] && u.unshift(o), n[o];
  }
  function Ut(e, t, n, r) {
    var i,
      o,
      a,
      s,
      u,
      l = {},
      c = e.dataTypes.slice();
    if (c[1]) for (a in e.converters) l[a.toLowerCase()] = e.converters[a];
    o = c.shift();
    while (o)
      if (
        (e.responseFields[o] && (n[e.responseFields[o]] = t),
        !u && r && e.dataFilter && (t = e.dataFilter(t, e.dataType)),
        (u = o),
        (o = c.shift()))
      )
        if ("*" === o) o = u;
        else if ("*" !== u && u !== o) {
          if (!(a = l[u + " " + o] || l["* " + o]))
            for (i in l)
              if (
                (s = i.split(" "))[1] === o &&
                (a = l[u + " " + s[0]] || l["* " + s[0]])
              ) {
                !0 === a
                  ? (a = l[i])
                  : !0 !== l[i] && ((o = s[0]), c.unshift(s[1]));
                break;
              }
          if (!0 !== a)
            if (a && e["throws"]) t = a(t);
            else
              try {
                t = a(t);
              } catch (e) {
                return {
                  state: "parsererror",
                  error: a ? e : "No conversion from " + u + " to " + o,
                };
              }
        }
    return { state: "success", data: t };
  }
  w.extend({
    active: 0,
    lastModified: {},
    etag: {},
    ajaxSettings: {
      url: Ct.href,
      type: "GET",
      isLocal: Pt.test(Ct.protocol),
      global: !0,
      processData: !0,
      async: !0,
      contentType: "application/x-www-form-urlencoded; charset=UTF-8",
      accepts: {
        "*": $t,
        text: "text/plain",
        html: "text/html",
        xml: "application/xml, text/xml",
        json: "application/json, text/javascript",
      },
      contents: { xml: /\bxml\b/, html: /\bhtml/, json: /\bjson\b/ },
      responseFields: {
        xml: "responseXML",
        text: "responseText",
        json: "responseJSON",
      },
      converters: {
        "* text": String,
        "text html": !0,
        "text json": JSON.parse,
        "text xml": w.parseXML,
      },
      flatOptions: { url: !0, context: !0 },
    },
    ajaxSetup: function (e, t) {
      return t ? zt(zt(e, w.ajaxSettings), t) : zt(w.ajaxSettings, e);
    },
    ajaxPrefilter: Ft(It),
    ajaxTransport: Ft(Wt),
    ajax: function (t, n) {
      "object" == typeof t && ((n = t), (t = void 0)), (n = n || {});
      var i,
        o,
        a,
        s,
        u,
        l,
        c,
        f,
        p,
        d,
        h = w.ajaxSetup({}, n),
        g = h.context || h,
        y = h.context && (g.nodeType || g.jquery) ? w(g) : w.event,
        v = w.Deferred(),
        m = w.Callbacks("once memory"),
        x = h.statusCode || {},
        b = {},
        T = {},
        C = "canceled",
        E = {
          readyState: 0,
          getResponseHeader: function (e) {
            var t;
            if (c) {
              if (!s) {
                s = {};
                while ((t = Ot.exec(a))) s[t[1].toLowerCase()] = t[2];
              }
              t = s[e.toLowerCase()];
            }
            return null == t ? null : t;
          },
          getAllResponseHeaders: function () {
            return c ? a : null;
          },
          setRequestHeader: function (e, t) {
            return (
              null == c &&
                ((e = T[e.toLowerCase()] = T[e.toLowerCase()] || e),
                (b[e] = t)),
              this
            );
          },
          overrideMimeType: function (e) {
            return null == c && (h.mimeType = e), this;
          },
          statusCode: function (e) {
            var t;
            if (e)
              if (c) E.always(e[E.status]);
              else for (t in e) x[t] = [x[t], e[t]];
            return this;
          },
          abort: function (e) {
            var t = e || C;
            return i && i.abort(t), k(0, t), this;
          },
        };
      if (
        (v.promise(E),
        (h.url = ((t || h.url || Ct.href) + "").replace(
          Rt,
          Ct.protocol + "//"
        )),
        (h.type = n.method || n.type || h.method || h.type),
        (h.dataTypes = (h.dataType || "*").toLowerCase().match(M) || [""]),
        null == h.crossDomain)
      ) {
        l = r.createElement("a");
        try {
          (l.href = h.url),
            (l.href = l.href),
            (h.crossDomain =
              Bt.protocol + "//" + Bt.host != l.protocol + "//" + l.host);
        } catch (e) {
          h.crossDomain = !0;
        }
      }
      if (
        (h.data &&
          h.processData &&
          "string" != typeof h.data &&
          (h.data = w.param(h.data, h.traditional)),
        _t(It, h, n, E),
        c)
      )
        return E;
      (f = w.event && h.global) &&
        0 == w.active++ &&
        w.event.trigger("ajaxStart"),
        (h.type = h.type.toUpperCase()),
        (h.hasContent = !Mt.test(h.type)),
        (o = h.url.replace(Lt, "")),
        h.hasContent
          ? h.data &&
            h.processData &&
            0 ===
              (h.contentType || "").indexOf(
                "application/x-www-form-urlencoded"
              ) &&
            (h.data = h.data.replace(qt, "+"))
          : ((d = h.url.slice(o.length)),
            h.data &&
              (h.processData || "string" == typeof h.data) &&
              ((o += (kt.test(o) ? "&" : "?") + h.data), delete h.data),
            !1 === h.cache &&
              ((o = o.replace(Ht, "$1")),
              (d = (kt.test(o) ? "&" : "?") + "_=" + Et++ + d)),
            (h.url = o + d)),
        h.ifModified &&
          (w.lastModified[o] &&
            E.setRequestHeader("If-Modified-Since", w.lastModified[o]),
          w.etag[o] && E.setRequestHeader("If-None-Match", w.etag[o])),
        ((h.data && h.hasContent && !1 !== h.contentType) || n.contentType) &&
          E.setRequestHeader("Content-Type", h.contentType),
        E.setRequestHeader(
          "Accept",
          h.dataTypes[0] && h.accepts[h.dataTypes[0]]
            ? h.accepts[h.dataTypes[0]] +
                ("*" !== h.dataTypes[0] ? ", " + $t + "; q=0.01" : "")
            : h.accepts["*"]
        );
      for (p in h.headers) E.setRequestHeader(p, h.headers[p]);
      if (h.beforeSend && (!1 === h.beforeSend.call(g, E, h) || c))
        return E.abort();
      if (
        ((C = "abort"),
        m.add(h.complete),
        E.done(h.success),
        E.fail(h.error),
        (i = _t(Wt, h, n, E)))
      ) {
        if (((E.readyState = 1), f && y.trigger("ajaxSend", [E, h]), c))
          return E;
        h.async &&
          h.timeout > 0 &&
          (u = e.setTimeout(function () {
            E.abort("timeout");
          }, h.timeout));
        try {
          (c = !1), i.send(b, k);
        } catch (e) {
          if (c) throw e;
          k(-1, e);
        }
      } else k(-1, "No Transport");
      function k(t, n, r, s) {
        var l,
          p,
          d,
          b,
          T,
          C = n;
        c ||
          ((c = !0),
          u && e.clearTimeout(u),
          (i = void 0),
          (a = s || ""),
          (E.readyState = t > 0 ? 4 : 0),
          (l = (t >= 200 && t < 300) || 304 === t),
          r && (b = Xt(h, E, r)),
          (b = Ut(h, b, E, l)),
          l
            ? (h.ifModified &&
                ((T = E.getResponseHeader("Last-Modified")) &&
                  (w.lastModified[o] = T),
                (T = E.getResponseHeader("etag")) && (w.etag[o] = T)),
              204 === t || "HEAD" === h.type
                ? (C = "nocontent")
                : 304 === t
                  ? (C = "notmodified")
                  : ((C = b.state), (p = b.data), (l = !(d = b.error))))
            : ((d = C), (!t && C) || ((C = "error"), t < 0 && (t = 0))),
          (E.status = t),
          (E.statusText = (n || C) + ""),
          l ? v.resolveWith(g, [p, C, E]) : v.rejectWith(g, [E, C, d]),
          E.statusCode(x),
          (x = void 0),
          f && y.trigger(l ? "ajaxSuccess" : "ajaxError", [E, h, l ? p : d]),
          m.fireWith(g, [E, C]),
          f &&
            (y.trigger("ajaxComplete", [E, h]),
            --w.active || w.event.trigger("ajaxStop")));
      }
      return E;
    },
    getJSON: function (e, t, n) {
      return w.get(e, t, n, "json");
    },
    getScript: function (e, t) {
      return w.get(e, void 0, t, "script");
    },
  }),
    w.each(["get", "post"], function (e, t) {
      w[t] = function (e, n, r, i) {
        return (
          g(n) && ((i = i || r), (r = n), (n = void 0)),
          w.ajax(
            w.extend(
              { url: e, type: t, dataType: i, data: n, success: r },
              w.isPlainObject(e) && e
            )
          )
        );
      };
    }),
    (w._evalUrl = function (e) {
      return w.ajax({
        url: e,
        type: "GET",
        dataType: "script",
        cache: !0,
        async: !1,
        global: !1,
        throws: !0,
      });
    }),
    w.fn.extend({
      wrapAll: function (e) {
        var t;
        return (
          this[0] &&
            (g(e) && (e = e.call(this[0])),
            (t = w(e, this[0].ownerDocument).eq(0).clone(!0)),
            this[0].parentNode && t.insertBefore(this[0]),
            t
              .map(function () {
                var e = this;
                while (e.firstElementChild) e = e.firstElementChild;
                return e;
              })
              .append(this)),
          this
        );
      },
      wrapInner: function (e) {
        return g(e)
          ? this.each(function (t) {
              w(this).wrapInner(e.call(this, t));
            })
          : this.each(function () {
              var t = w(this),
                n = t.contents();
              n.length ? n.wrapAll(e) : t.append(e);
            });
      },
      wrap: function (e) {
        var t = g(e);
        return this.each(function (n) {
          w(this).wrapAll(t ? e.call(this, n) : e);
        });
      },
      unwrap: function (e) {
        return (
          this.parent(e)
            .not("body")
            .each(function () {
              w(this).replaceWith(this.childNodes);
            }),
          this
        );
      },
    }),
    (w.expr.pseudos.hidden = function (e) {
      return !w.expr.pseudos.visible(e);
    }),
    (w.expr.pseudos.visible = function (e) {
      return !!(e.offsetWidth || e.offsetHeight || e.getClientRects().length);
    }),
    (w.ajaxSettings.xhr = function () {
      try {
        return new e.XMLHttpRequest();
      } catch (e) {}
    });
  var Vt = { 0: 200, 1223: 204 },
    Gt = w.ajaxSettings.xhr();
  (h.cors = !!Gt && "withCredentials" in Gt),
    (h.ajax = Gt = !!Gt),
    w.ajaxTransport(function (t) {
      var n, r;
      if (h.cors || (Gt && !t.crossDomain))
        return {
          send: function (i, o) {
            var a,
              s = t.xhr();
            if (
              (s.open(t.type, t.url, t.async, t.username, t.password),
              t.xhrFields)
            )
              for (a in t.xhrFields) s[a] = t.xhrFields[a];
            t.mimeType && s.overrideMimeType && s.overrideMimeType(t.mimeType),
              t.crossDomain ||
                i["X-Requested-With"] ||
                (i["X-Requested-With"] = "XMLHttpRequest");
            for (a in i) s.setRequestHeader(a, i[a]);
            (n = function (e) {
              return function () {
                n &&
                  ((n =
                    r =
                    s.onload =
                    s.onerror =
                    s.onabort =
                    s.ontimeout =
                    s.onreadystatechange =
                      null),
                  "abort" === e
                    ? s.abort()
                    : "error" === e
                      ? "number" != typeof s.status
                        ? o(0, "error")
                        : o(s.status, s.statusText)
                      : o(
                          Vt[s.status] || s.status,
                          s.statusText,
                          "text" !== (s.responseType || "text") ||
                            "string" != typeof s.responseText
                            ? { binary: s.response }
                            : { text: s.responseText },
                          s.getAllResponseHeaders()
                        ));
              };
            }),
              (s.onload = n()),
              (r = s.onerror = s.ontimeout = n("error")),
              void 0 !== s.onabort
                ? (s.onabort = r)
                : (s.onreadystatechange = function () {
                    4 === s.readyState &&
                      e.setTimeout(function () {
                        n && r();
                      });
                  }),
              (n = n("abort"));
            try {
              s.send((t.hasContent && t.data) || null);
            } catch (e) {
              if (n) throw e;
            }
          },
          abort: function () {
            n && n();
          },
        };
    }),
    w.ajaxPrefilter(function (e) {
      e.crossDomain && (e.contents.script = !1);
    }),
    w.ajaxSetup({
      accepts: {
        script:
          "text/javascript, application/javascript, application/ecmascript, application/x-ecmascript",
      },
      contents: { script: /\b(?:java|ecma)script\b/ },
      converters: {
        "text script": function (e) {
          return w.globalEval(e), e;
        },
      },
    }),
    w.ajaxPrefilter("script", function (e) {
      void 0 === e.cache && (e.cache = !1), e.crossDomain && (e.type = "GET");
    }),
    w.ajaxTransport("script", function (e) {
      if (e.crossDomain) {
        var t, n;
        return {
          send: function (i, o) {
            (t = w("<script>")
              .prop({ charset: e.scriptCharset, src: e.url })
              .on(
                "load error",
                (n = function (e) {
                  t.remove(),
                    (n = null),
                    e && o("error" === e.type ? 404 : 200, e.type);
                })
              )),
              r.head.appendChild(t[0]);
          },
          abort: function () {
            n && n();
          },
        };
      }
    });
  var Yt = [],
    Qt = /(=)\?(?=&|$)|\?\?/;
  w.ajaxSetup({
    jsonp: "callback",
    jsonpCallback: function () {
      var e = Yt.pop() || w.expando + "_" + Et++;
      return (this[e] = !0), e;
    },
  }),
    w.ajaxPrefilter("json jsonp", function (t, n, r) {
      var i,
        o,
        a,
        s =
          !1 !== t.jsonp &&
          (Qt.test(t.url)
            ? "url"
            : "string" == typeof t.data &&
              0 ===
                (t.contentType || "").indexOf(
                  "application/x-www-form-urlencoded"
                ) &&
              Qt.test(t.data) &&
              "data");
      if (s || "jsonp" === t.dataTypes[0])
        return (
          (i = t.jsonpCallback =
            g(t.jsonpCallback) ? t.jsonpCallback() : t.jsonpCallback),
          s
            ? (t[s] = t[s].replace(Qt, "$1" + i))
            : !1 !== t.jsonp &&
              (t.url += (kt.test(t.url) ? "&" : "?") + t.jsonp + "=" + i),
          (t.converters["script json"] = function () {
            return a || w.error(i + " was not called"), a[0];
          }),
          (t.dataTypes[0] = "json"),
          (o = e[i]),
          (e[i] = function () {
            a = arguments;
          }),
          r.always(function () {
            void 0 === o ? w(e).removeProp(i) : (e[i] = o),
              t[i] && ((t.jsonpCallback = n.jsonpCallback), Yt.push(i)),
              a && g(o) && o(a[0]),
              (a = o = void 0);
          }),
          "script"
        );
    }),
    (h.createHTMLDocument = (function () {
      var e = r.implementation.createHTMLDocument("").body;
      return (
        (e.innerHTML = "<form></form><form></form>"), 2 === e.childNodes.length
      );
    })()),
    (w.parseHTML = function (e, t, n) {
      if ("string" != typeof e) return [];
      "boolean" == typeof t && ((n = t), (t = !1));
      var i, o, a;
      return (
        t ||
          (h.createHTMLDocument
            ? (((i = (t =
                r.implementation.createHTMLDocument("")).createElement(
                "base"
              )).href = r.location.href),
              t.head.appendChild(i))
            : (t = r)),
        (o = A.exec(e)),
        (a = !n && []),
        o
          ? [t.createElement(o[1])]
          : ((o = xe([e], t, a)),
            a && a.length && w(a).remove(),
            w.merge([], o.childNodes))
      );
    }),
    (w.fn.load = function (e, t, n) {
      var r,
        i,
        o,
        a = this,
        s = e.indexOf(" ");
      return (
        s > -1 && ((r = vt(e.slice(s))), (e = e.slice(0, s))),
        g(t)
          ? ((n = t), (t = void 0))
          : t && "object" == typeof t && (i = "POST"),
        a.length > 0 &&
          w
            .ajax({ url: e, type: i || "GET", dataType: "html", data: t })
            .done(function (e) {
              (o = arguments),
                a.html(r ? w("<div>").append(w.parseHTML(e)).find(r) : e);
            })
            .always(
              n &&
                function (e, t) {
                  a.each(function () {
                    n.apply(this, o || [e.responseText, t, e]);
                  });
                }
            ),
        this
      );
    }),
    w.each(
      [
        "ajaxStart",
        "ajaxStop",
        "ajaxComplete",
        "ajaxError",
        "ajaxSuccess",
        "ajaxSend",
      ],
      function (e, t) {
        w.fn[t] = function (e) {
          return this.on(t, e);
        };
      }
    ),
    (w.expr.pseudos.animated = function (e) {
      return w.grep(w.timers, function (t) {
        return e === t.elem;
      }).length;
    }),
    (w.offset = {
      setOffset: function (e, t, n) {
        var r,
          i,
          o,
          a,
          s,
          u,
          l,
          c = w.css(e, "position"),
          f = w(e),
          p = {};
        "static" === c && (e.style.position = "relative"),
          (s = f.offset()),
          (o = w.css(e, "top")),
          (u = w.css(e, "left")),
          (l =
            ("absolute" === c || "fixed" === c) && (o + u).indexOf("auto") > -1)
            ? ((a = (r = f.position()).top), (i = r.left))
            : ((a = parseFloat(o) || 0), (i = parseFloat(u) || 0)),
          g(t) && (t = t.call(e, n, w.extend({}, s))),
          null != t.top && (p.top = t.top - s.top + a),
          null != t.left && (p.left = t.left - s.left + i),
          "using" in t ? t.using.call(e, p) : f.css(p);
      },
    }),
    w.fn.extend({
      offset: function (e) {
        if (arguments.length)
          return void 0 === e
            ? this
            : this.each(function (t) {
                w.offset.setOffset(this, e, t);
              });
        var t,
          n,
          r = this[0];
        if (r)
          return r.getClientRects().length
            ? ((t = r.getBoundingClientRect()),
              (n = r.ownerDocument.defaultView),
              { top: t.top + n.pageYOffset, left: t.left + n.pageXOffset })
            : { top: 0, left: 0 };
      },
      position: function () {
        if (this[0]) {
          var e,
            t,
            n,
            r = this[0],
            i = { top: 0, left: 0 };
          if ("fixed" === w.css(r, "position")) t = r.getBoundingClientRect();
          else {
            (t = this.offset()),
              (n = r.ownerDocument),
              (e = r.offsetParent || n.documentElement);
            while (
              e &&
              (e === n.body || e === n.documentElement) &&
              "static" === w.css(e, "position")
            )
              e = e.parentNode;
            e &&
              e !== r &&
              1 === e.nodeType &&
              (((i = w(e).offset()).top += w.css(e, "borderTopWidth", !0)),
              (i.left += w.css(e, "borderLeftWidth", !0)));
          }
          return {
            top: t.top - i.top - w.css(r, "marginTop", !0),
            left: t.left - i.left - w.css(r, "marginLeft", !0),
          };
        }
      },
      offsetParent: function () {
        return this.map(function () {
          var e = this.offsetParent;
          while (e && "static" === w.css(e, "position")) e = e.offsetParent;
          return e || be;
        });
      },
    }),
    w.each(
      { scrollLeft: "pageXOffset", scrollTop: "pageYOffset" },
      function (e, t) {
        var n = "pageYOffset" === t;
        w.fn[e] = function (r) {
          return z(
            this,
            function (e, r, i) {
              var o;
              if (
                (y(e) ? (o = e) : 9 === e.nodeType && (o = e.defaultView),
                void 0 === i)
              )
                return o ? o[t] : e[r];
              o
                ? o.scrollTo(n ? o.pageXOffset : i, n ? i : o.pageYOffset)
                : (e[r] = i);
            },
            e,
            r,
            arguments.length
          );
        };
      }
    ),
    w.each(["top", "left"], function (e, t) {
      w.cssHooks[t] = _e(h.pixelPosition, function (e, n) {
        if (n)
          return (n = Fe(e, t)), We.test(n) ? w(e).position()[t] + "px" : n;
      });
    }),
    w.each({ Height: "height", Width: "width" }, function (e, t) {
      w.each(
        { padding: "inner" + e, content: t, "": "outer" + e },
        function (n, r) {
          w.fn[r] = function (i, o) {
            var a = arguments.length && (n || "boolean" != typeof i),
              s = n || (!0 === i || !0 === o ? "margin" : "border");
            return z(
              this,
              function (t, n, i) {
                var o;
                return y(t)
                  ? 0 === r.indexOf("outer")
                    ? t["inner" + e]
                    : t.document.documentElement["client" + e]
                  : 9 === t.nodeType
                    ? ((o = t.documentElement),
                      Math.max(
                        t.body["scroll" + e],
                        o["scroll" + e],
                        t.body["offset" + e],
                        o["offset" + e],
                        o["client" + e]
                      ))
                    : void 0 === i
                      ? w.css(t, n, s)
                      : w.style(t, n, i, s);
              },
              t,
              a ? i : void 0,
              a
            );
          };
        }
      );
    }),
    w.each(
      "blur focus focusin focusout resize scroll click dblclick mousedown mouseup mousemove mouseover mouseout mouseenter mouseleave change select submit keydown keypress keyup contextmenu".split(
        " "
      ),
      function (e, t) {
        w.fn[t] = function (e, n) {
          return arguments.length > 0
            ? this.on(t, null, e, n)
            : this.trigger(t);
        };
      }
    ),
    w.fn.extend({
      hover: function (e, t) {
        return this.mouseenter(e).mouseleave(t || e);
      },
    }),
    w.fn.extend({
      bind: function (e, t, n) {
        return this.on(e, null, t, n);
      },
      unbind: function (e, t) {
        return this.off(e, null, t);
      },
      delegate: function (e, t, n, r) {
        return this.on(t, e, n, r);
      },
      undelegate: function (e, t, n) {
        return 1 === arguments.length
          ? this.off(e, "**")
          : this.off(t, e || "**", n);
      },
    }),
    (w.proxy = function (e, t) {
      var n, r, i;
      if (("string" == typeof t && ((n = e[t]), (t = e), (e = n)), g(e)))
        return (
          (r = o.call(arguments, 2)),
          (i = function () {
            return e.apply(t || this, r.concat(o.call(arguments)));
          }),
          (i.guid = e.guid = e.guid || w.guid++),
          i
        );
    }),
    (w.holdReady = function (e) {
      e ? w.readyWait++ : w.ready(!0);
    }),
    (w.isArray = Array.isArray),
    (w.parseJSON = JSON.parse),
    (w.nodeName = N),
    (w.isFunction = g),
    (w.isWindow = y),
    (w.camelCase = G),
    (w.type = x),
    (w.now = Date.now),
    (w.isNumeric = function (e) {
      var t = w.type(e);
      return ("number" === t || "string" === t) && !isNaN(e - parseFloat(e));
    }),
    "function" == typeof define &&
      define.amd &&
      define("jquery", [], function () {
        return w;
      });
  var Jt = e.jQuery,
    Kt = e.$;
  return (
    (w.noConflict = function (t) {
      return e.$ === w && (e.$ = Kt), t && e.jQuery === w && (e.jQuery = Jt), w;
    }),
    t || (e.jQuery = e.$ = w),
    w
  );
});

/*!
 * Bootstrap v4.1.1 (https://getbootstrap.com/)
 * Copyright 2011-2018 The Bootstrap Authors (https://github.com/twbs/bootstrap/graphs/contributors)
 * Licensed under MIT (https://github.com/twbs/bootstrap/blob/master/LICENSE)
 */
!(function (t, e) {
  "object" == typeof exports && "undefined" != typeof module
    ? e(exports, require("jquery"), require("popper.js"))
    : "function" == typeof define && define.amd
      ? define(["exports", "jquery", "popper.js"], e)
      : e((t.bootstrap = {}), t.jQuery, t.Popper);
})(this, function (t, e, c) {
  "use strict";
  function i(t, e) {
    for (var n = 0; n < e.length; n++) {
      var i = e[n];
      (i.enumerable = i.enumerable || !1),
        (i.configurable = !0),
        "value" in i && (i.writable = !0),
        Object.defineProperty(t, i.key, i);
    }
  }
  function o(t, e, n) {
    return e && i(t.prototype, e), n && i(t, n), t;
  }
  function h(r) {
    for (var t = 1; t < arguments.length; t++) {
      var s = null != arguments[t] ? arguments[t] : {},
        e = Object.keys(s);
      "function" == typeof Object.getOwnPropertySymbols &&
        (e = e.concat(
          Object.getOwnPropertySymbols(s).filter(function (t) {
            return Object.getOwnPropertyDescriptor(s, t).enumerable;
          })
        )),
        e.forEach(function (t) {
          var e, n, i;
          (e = r),
            (i = s[(n = t)]),
            n in e
              ? Object.defineProperty(e, n, {
                  value: i,
                  enumerable: !0,
                  configurable: !0,
                  writable: !0,
                })
              : (e[n] = i);
        });
    }
    return r;
  }
  (e = e && e.hasOwnProperty("default") ? e.default : e),
    (c = c && c.hasOwnProperty("default") ? c.default : c);
  var r,
    n,
    s,
    a,
    l,
    u,
    f,
    d,
    _,
    g,
    m,
    p,
    v,
    E,
    y,
    T,
    C,
    I,
    A,
    D,
    b,
    S,
    w,
    N,
    O,
    k,
    P,
    L,
    j,
    R,
    H,
    W,
    M,
    x,
    U,
    K,
    F,
    V,
    Q,
    B,
    Y,
    G,
    q,
    z,
    X,
    J,
    Z,
    $,
    tt,
    et,
    nt,
    it,
    rt,
    st,
    ot,
    at,
    lt,
    ht,
    ct,
    ut,
    ft,
    dt,
    _t,
    gt,
    mt,
    pt,
    vt,
    Et,
    yt,
    Tt,
    Ct,
    It,
    At,
    Dt,
    bt,
    St,
    wt,
    Nt,
    Ot,
    kt,
    Pt,
    Lt,
    jt,
    Rt,
    Ht,
    Wt,
    Mt,
    xt,
    Ut,
    Kt,
    Ft,
    Vt,
    Qt,
    Bt,
    Yt,
    Gt,
    qt,
    zt,
    Xt,
    Jt,
    Zt,
    $t,
    te,
    ee,
    ne,
    ie,
    re,
    se,
    oe,
    ae,
    le,
    he,
    ce,
    ue,
    fe,
    de,
    _e,
    ge,
    me,
    pe,
    ve,
    Ee,
    ye,
    Te,
    Ce,
    Ie,
    Ae,
    De,
    be,
    Se,
    we,
    Ne,
    Oe,
    ke,
    Pe,
    Le,
    je,
    Re,
    He,
    We,
    Me,
    xe,
    Ue,
    Ke,
    Fe,
    Ve,
    Qe,
    Be,
    Ye,
    Ge,
    qe,
    ze,
    Xe,
    Je,
    Ze,
    $e,
    tn,
    en,
    nn,
    rn,
    sn,
    on,
    an,
    ln,
    hn,
    cn,
    un,
    fn,
    dn,
    _n,
    gn,
    mn,
    pn,
    vn,
    En,
    yn,
    Tn,
    Cn = (function (i) {
      var e = "transitionend";
      function t(t) {
        var e = this,
          n = !1;
        return (
          i(this).one(l.TRANSITION_END, function () {
            n = !0;
          }),
          setTimeout(function () {
            n || l.triggerTransitionEnd(e);
          }, t),
          this
        );
      }
      var l = {
        TRANSITION_END: "bsTransitionEnd",
        getUID: function (t) {
          for (; (t += ~~(1e6 * Math.random())), document.getElementById(t); );
          return t;
        },
        getSelectorFromElement: function (t) {
          var e = t.getAttribute("data-target");
          (e && "#" !== e) || (e = t.getAttribute("href") || "");
          try {
            return 0 < i(document).find(e).length ? e : null;
          } catch (t) {
            return null;
          }
        },
        getTransitionDurationFromElement: function (t) {
          if (!t) return 0;
          var e = i(t).css("transition-duration");
          return parseFloat(e)
            ? ((e = e.split(",")[0]), 1e3 * parseFloat(e))
            : 0;
        },
        reflow: function (t) {
          return t.offsetHeight;
        },
        triggerTransitionEnd: function (t) {
          i(t).trigger(e);
        },
        supportsTransitionEnd: function () {
          return Boolean(e);
        },
        isElement: function (t) {
          return (t[0] || t).nodeType;
        },
        typeCheckConfig: function (t, e, n) {
          for (var i in n)
            if (Object.prototype.hasOwnProperty.call(n, i)) {
              var r = n[i],
                s = e[i],
                o =
                  s && l.isElement(s)
                    ? "element"
                    : ((a = s),
                      {}.toString
                        .call(a)
                        .match(/\s([a-z]+)/i)[1]
                        .toLowerCase());
              if (!new RegExp(r).test(o))
                throw new Error(
                  t.toUpperCase() +
                    ': Option "' +
                    i +
                    '" provided type "' +
                    o +
                    '" but expected type "' +
                    r +
                    '".'
                );
            }
          var a;
        },
      };
      return (
        (i.fn.emulateTransitionEnd = t),
        (i.event.special[l.TRANSITION_END] = {
          bindType: e,
          delegateType: e,
          handle: function (t) {
            if (i(t.target).is(this))
              return t.handleObj.handler.apply(this, arguments);
          },
        }),
        l
      );
    })(e),
    In =
      ((n = "alert"),
      (a = "." + (s = "bs.alert")),
      (l = (r = e).fn[n]),
      (u = {
        CLOSE: "close" + a,
        CLOSED: "closed" + a,
        CLICK_DATA_API: "click" + a + ".data-api",
      }),
      (f = "alert"),
      (d = "fade"),
      (_ = "show"),
      (g = (function () {
        function i(t) {
          this._element = t;
        }
        var t = i.prototype;
        return (
          (t.close = function (t) {
            var e = this._element;
            t && (e = this._getRootElement(t)),
              this._triggerCloseEvent(e).isDefaultPrevented() ||
                this._removeElement(e);
          }),
          (t.dispose = function () {
            r.removeData(this._element, s), (this._element = null);
          }),
          (t._getRootElement = function (t) {
            var e = Cn.getSelectorFromElement(t),
              n = !1;
            return e && (n = r(e)[0]), n || (n = r(t).closest("." + f)[0]), n;
          }),
          (t._triggerCloseEvent = function (t) {
            var e = r.Event(u.CLOSE);
            return r(t).trigger(e), e;
          }),
          (t._removeElement = function (e) {
            var n = this;
            if ((r(e).removeClass(_), r(e).hasClass(d))) {
              var t = Cn.getTransitionDurationFromElement(e);
              r(e)
                .one(Cn.TRANSITION_END, function (t) {
                  return n._destroyElement(e, t);
                })
                .emulateTransitionEnd(t);
            } else this._destroyElement(e);
          }),
          (t._destroyElement = function (t) {
            r(t).detach().trigger(u.CLOSED).remove();
          }),
          (i._jQueryInterface = function (n) {
            return this.each(function () {
              var t = r(this),
                e = t.data(s);
              e || ((e = new i(this)), t.data(s, e)),
                "close" === n && e[n](this);
            });
          }),
          (i._handleDismiss = function (e) {
            return function (t) {
              t && t.preventDefault(), e.close(this);
            };
          }),
          o(i, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
          ]),
          i
        );
      })()),
      r(document).on(
        u.CLICK_DATA_API,
        '[data-dismiss="alert"]',
        g._handleDismiss(new g())
      ),
      (r.fn[n] = g._jQueryInterface),
      (r.fn[n].Constructor = g),
      (r.fn[n].noConflict = function () {
        return (r.fn[n] = l), g._jQueryInterface;
      }),
      g),
    An =
      ((p = "button"),
      (E = "." + (v = "bs.button")),
      (y = ".data-api"),
      (T = (m = e).fn[p]),
      (C = "active"),
      (I = "btn"),
      (D = '[data-toggle^="button"]'),
      (b = '[data-toggle="buttons"]'),
      (S = "input"),
      (w = ".active"),
      (N = ".btn"),
      (O = {
        CLICK_DATA_API: "click" + E + y,
        FOCUS_BLUR_DATA_API: (A = "focus") + E + y + " blur" + E + y,
      }),
      (k = (function () {
        function n(t) {
          this._element = t;
        }
        var t = n.prototype;
        return (
          (t.toggle = function () {
            var t = !0,
              e = !0,
              n = m(this._element).closest(b)[0];
            if (n) {
              var i = m(this._element).find(S)[0];
              if (i) {
                if ("radio" === i.type)
                  if (i.checked && m(this._element).hasClass(C)) t = !1;
                  else {
                    var r = m(n).find(w)[0];
                    r && m(r).removeClass(C);
                  }
                if (t) {
                  if (
                    i.hasAttribute("disabled") ||
                    n.hasAttribute("disabled") ||
                    i.classList.contains("disabled") ||
                    n.classList.contains("disabled")
                  )
                    return;
                  (i.checked = !m(this._element).hasClass(C)),
                    m(i).trigger("change");
                }
                i.focus(), (e = !1);
              }
            }
            e &&
              this._element.setAttribute(
                "aria-pressed",
                !m(this._element).hasClass(C)
              ),
              t && m(this._element).toggleClass(C);
          }),
          (t.dispose = function () {
            m.removeData(this._element, v), (this._element = null);
          }),
          (n._jQueryInterface = function (e) {
            return this.each(function () {
              var t = m(this).data(v);
              t || ((t = new n(this)), m(this).data(v, t)),
                "toggle" === e && t[e]();
            });
          }),
          o(n, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
          ]),
          n
        );
      })()),
      m(document)
        .on(O.CLICK_DATA_API, D, function (t) {
          t.preventDefault();
          var e = t.target;
          m(e).hasClass(I) || (e = m(e).closest(N)),
            k._jQueryInterface.call(m(e), "toggle");
        })
        .on(O.FOCUS_BLUR_DATA_API, D, function (t) {
          var e = m(t.target).closest(N)[0];
          m(e).toggleClass(A, /^focus(in)?$/.test(t.type));
        }),
      (m.fn[p] = k._jQueryInterface),
      (m.fn[p].Constructor = k),
      (m.fn[p].noConflict = function () {
        return (m.fn[p] = T), k._jQueryInterface;
      }),
      k),
    Dn =
      ((L = "carousel"),
      (R = "." + (j = "bs.carousel")),
      (H = ".data-api"),
      (W = (P = e).fn[L]),
      (M = {
        interval: 5e3,
        keyboard: !0,
        slide: !1,
        pause: "hover",
        wrap: !0,
      }),
      (x = {
        interval: "(number|boolean)",
        keyboard: "boolean",
        slide: "(boolean|string)",
        pause: "(string|boolean)",
        wrap: "boolean",
      }),
      (U = "next"),
      (K = "prev"),
      (F = "left"),
      (V = "right"),
      (Q = {
        SLIDE: "slide" + R,
        SLID: "slid" + R,
        KEYDOWN: "keydown" + R,
        MOUSEENTER: "mouseenter" + R,
        MOUSELEAVE: "mouseleave" + R,
        TOUCHEND: "touchend" + R,
        LOAD_DATA_API: "load" + R + H,
        CLICK_DATA_API: "click" + R + H,
      }),
      (B = "carousel"),
      (Y = "active"),
      (G = "slide"),
      (q = "carousel-item-right"),
      (z = "carousel-item-left"),
      (X = "carousel-item-next"),
      (J = "carousel-item-prev"),
      (Z = {
        ACTIVE: ".active",
        ACTIVE_ITEM: ".active.carousel-item",
        ITEM: ".carousel-item",
        NEXT_PREV: ".carousel-item-next, .carousel-item-prev",
        INDICATORS: ".carousel-indicators",
        DATA_SLIDE: "[data-slide], [data-slide-to]",
        DATA_RIDE: '[data-ride="carousel"]',
      }),
      ($ = (function () {
        function s(t, e) {
          (this._items = null),
            (this._interval = null),
            (this._activeElement = null),
            (this._isPaused = !1),
            (this._isSliding = !1),
            (this.touchTimeout = null),
            (this._config = this._getConfig(e)),
            (this._element = P(t)[0]),
            (this._indicatorsElement = P(this._element).find(Z.INDICATORS)[0]),
            this._addEventListeners();
        }
        var t = s.prototype;
        return (
          (t.next = function () {
            this._isSliding || this._slide(U);
          }),
          (t.nextWhenVisible = function () {
            !document.hidden &&
              P(this._element).is(":visible") &&
              "hidden" !== P(this._element).css("visibility") &&
              this.next();
          }),
          (t.prev = function () {
            this._isSliding || this._slide(K);
          }),
          (t.pause = function (t) {
            t || (this._isPaused = !0),
              P(this._element).find(Z.NEXT_PREV)[0] &&
                (Cn.triggerTransitionEnd(this._element), this.cycle(!0)),
              clearInterval(this._interval),
              (this._interval = null);
          }),
          (t.cycle = function (t) {
            t || (this._isPaused = !1),
              this._interval &&
                (clearInterval(this._interval), (this._interval = null)),
              this._config.interval &&
                !this._isPaused &&
                (this._interval = setInterval(
                  (document.visibilityState
                    ? this.nextWhenVisible
                    : this.next
                  ).bind(this),
                  this._config.interval
                ));
          }),
          (t.to = function (t) {
            var e = this;
            this._activeElement = P(this._element).find(Z.ACTIVE_ITEM)[0];
            var n = this._getItemIndex(this._activeElement);
            if (!(t > this._items.length - 1 || t < 0))
              if (this._isSliding)
                P(this._element).one(Q.SLID, function () {
                  return e.to(t);
                });
              else {
                if (n === t) return this.pause(), void this.cycle();
                var i = n < t ? U : K;
                this._slide(i, this._items[t]);
              }
          }),
          (t.dispose = function () {
            P(this._element).off(R),
              P.removeData(this._element, j),
              (this._items = null),
              (this._config = null),
              (this._element = null),
              (this._interval = null),
              (this._isPaused = null),
              (this._isSliding = null),
              (this._activeElement = null),
              (this._indicatorsElement = null);
          }),
          (t._getConfig = function (t) {
            return (t = h({}, M, t)), Cn.typeCheckConfig(L, t, x), t;
          }),
          (t._addEventListeners = function () {
            var e = this;
            this._config.keyboard &&
              P(this._element).on(Q.KEYDOWN, function (t) {
                return e._keydown(t);
              }),
              "hover" === this._config.pause &&
                (P(this._element)
                  .on(Q.MOUSEENTER, function (t) {
                    return e.pause(t);
                  })
                  .on(Q.MOUSELEAVE, function (t) {
                    return e.cycle(t);
                  }),
                "ontouchstart" in document.documentElement &&
                  P(this._element).on(Q.TOUCHEND, function () {
                    e.pause(),
                      e.touchTimeout && clearTimeout(e.touchTimeout),
                      (e.touchTimeout = setTimeout(function (t) {
                        return e.cycle(t);
                      }, 500 + e._config.interval));
                  }));
          }),
          (t._keydown = function (t) {
            if (!/input|textarea/i.test(t.target.tagName))
              switch (t.which) {
                case 37:
                  t.preventDefault(), this.prev();
                  break;
                case 39:
                  t.preventDefault(), this.next();
              }
          }),
          (t._getItemIndex = function (t) {
            return (
              (this._items = P.makeArray(P(t).parent().find(Z.ITEM))),
              this._items.indexOf(t)
            );
          }),
          (t._getItemByDirection = function (t, e) {
            var n = t === U,
              i = t === K,
              r = this._getItemIndex(e),
              s = this._items.length - 1;
            if (((i && 0 === r) || (n && r === s)) && !this._config.wrap)
              return e;
            var o = (r + (t === K ? -1 : 1)) % this._items.length;
            return -1 === o
              ? this._items[this._items.length - 1]
              : this._items[o];
          }),
          (t._triggerSlideEvent = function (t, e) {
            var n = this._getItemIndex(t),
              i = this._getItemIndex(P(this._element).find(Z.ACTIVE_ITEM)[0]),
              r = P.Event(Q.SLIDE, {
                relatedTarget: t,
                direction: e,
                from: i,
                to: n,
              });
            return P(this._element).trigger(r), r;
          }),
          (t._setActiveIndicatorElement = function (t) {
            if (this._indicatorsElement) {
              P(this._indicatorsElement).find(Z.ACTIVE).removeClass(Y);
              var e = this._indicatorsElement.children[this._getItemIndex(t)];
              e && P(e).addClass(Y);
            }
          }),
          (t._slide = function (t, e) {
            var n,
              i,
              r,
              s = this,
              o = P(this._element).find(Z.ACTIVE_ITEM)[0],
              a = this._getItemIndex(o),
              l = e || (o && this._getItemByDirection(t, o)),
              h = this._getItemIndex(l),
              c = Boolean(this._interval);
            if (
              (t === U
                ? ((n = z), (i = X), (r = F))
                : ((n = q), (i = J), (r = V)),
              l && P(l).hasClass(Y))
            )
              this._isSliding = !1;
            else if (
              !this._triggerSlideEvent(l, r).isDefaultPrevented() &&
              o &&
              l
            ) {
              (this._isSliding = !0),
                c && this.pause(),
                this._setActiveIndicatorElement(l);
              var u = P.Event(Q.SLID, {
                relatedTarget: l,
                direction: r,
                from: a,
                to: h,
              });
              if (P(this._element).hasClass(G)) {
                P(l).addClass(i),
                  Cn.reflow(l),
                  P(o).addClass(n),
                  P(l).addClass(n);
                var f = Cn.getTransitionDurationFromElement(o);
                P(o)
                  .one(Cn.TRANSITION_END, function () {
                    P(l)
                      .removeClass(n + " " + i)
                      .addClass(Y),
                      P(o).removeClass(Y + " " + i + " " + n),
                      (s._isSliding = !1),
                      setTimeout(function () {
                        return P(s._element).trigger(u);
                      }, 0);
                  })
                  .emulateTransitionEnd(f);
              } else
                P(o).removeClass(Y),
                  P(l).addClass(Y),
                  (this._isSliding = !1),
                  P(this._element).trigger(u);
              c && this.cycle();
            }
          }),
          (s._jQueryInterface = function (i) {
            return this.each(function () {
              var t = P(this).data(j),
                e = h({}, M, P(this).data());
              "object" == typeof i && (e = h({}, e, i));
              var n = "string" == typeof i ? i : e.slide;
              if (
                (t || ((t = new s(this, e)), P(this).data(j, t)),
                "number" == typeof i)
              )
                t.to(i);
              else if ("string" == typeof n) {
                if ("undefined" == typeof t[n])
                  throw new TypeError('No method named "' + n + '"');
                t[n]();
              } else e.interval && (t.pause(), t.cycle());
            });
          }),
          (s._dataApiClickHandler = function (t) {
            var e = Cn.getSelectorFromElement(this);
            if (e) {
              var n = P(e)[0];
              if (n && P(n).hasClass(B)) {
                var i = h({}, P(n).data(), P(this).data()),
                  r = this.getAttribute("data-slide-to");
                r && (i.interval = !1),
                  s._jQueryInterface.call(P(n), i),
                  r && P(n).data(j).to(r),
                  t.preventDefault();
              }
            }
          }),
          o(s, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
            {
              key: "Default",
              get: function () {
                return M;
              },
            },
          ]),
          s
        );
      })()),
      P(document).on(Q.CLICK_DATA_API, Z.DATA_SLIDE, $._dataApiClickHandler),
      P(window).on(Q.LOAD_DATA_API, function () {
        P(Z.DATA_RIDE).each(function () {
          var t = P(this);
          $._jQueryInterface.call(t, t.data());
        });
      }),
      (P.fn[L] = $._jQueryInterface),
      (P.fn[L].Constructor = $),
      (P.fn[L].noConflict = function () {
        return (P.fn[L] = W), $._jQueryInterface;
      }),
      $),
    bn =
      ((et = "collapse"),
      (it = "." + (nt = "bs.collapse")),
      (rt = (tt = e).fn[et]),
      (st = { toggle: !0, parent: "" }),
      (ot = { toggle: "boolean", parent: "(string|element)" }),
      (at = {
        SHOW: "show" + it,
        SHOWN: "shown" + it,
        HIDE: "hide" + it,
        HIDDEN: "hidden" + it,
        CLICK_DATA_API: "click" + it + ".data-api",
      }),
      (lt = "show"),
      (ht = "collapse"),
      (ct = "collapsing"),
      (ut = "collapsed"),
      (ft = "width"),
      (dt = "height"),
      (_t = {
        ACTIVES: ".show, .collapsing",
        DATA_TOGGLE: '[data-toggle="collapse"]',
      }),
      (gt = (function () {
        function a(t, e) {
          (this._isTransitioning = !1),
            (this._element = t),
            (this._config = this._getConfig(e)),
            (this._triggerArray = tt.makeArray(
              tt(
                '[data-toggle="collapse"][href="#' +
                  t.id +
                  '"],[data-toggle="collapse"][data-target="#' +
                  t.id +
                  '"]'
              )
            ));
          for (var n = tt(_t.DATA_TOGGLE), i = 0; i < n.length; i++) {
            var r = n[i],
              s = Cn.getSelectorFromElement(r);
            null !== s &&
              0 < tt(s).filter(t).length &&
              ((this._selector = s), this._triggerArray.push(r));
          }
          (this._parent = this._config.parent ? this._getParent() : null),
            this._config.parent ||
              this._addAriaAndCollapsedClass(this._element, this._triggerArray),
            this._config.toggle && this.toggle();
        }
        var t = a.prototype;
        return (
          (t.toggle = function () {
            tt(this._element).hasClass(lt) ? this.hide() : this.show();
          }),
          (t.show = function () {
            var t,
              e,
              n = this;
            if (
              !this._isTransitioning &&
              !tt(this._element).hasClass(lt) &&
              (this._parent &&
                0 ===
                  (t = tt.makeArray(
                    tt(this._parent)
                      .find(_t.ACTIVES)
                      .filter('[data-parent="' + this._config.parent + '"]')
                  )).length &&
                (t = null),
              !(
                t &&
                (e = tt(t).not(this._selector).data(nt)) &&
                e._isTransitioning
              ))
            ) {
              var i = tt.Event(at.SHOW);
              if ((tt(this._element).trigger(i), !i.isDefaultPrevented())) {
                t &&
                  (a._jQueryInterface.call(tt(t).not(this._selector), "hide"),
                  e || tt(t).data(nt, null));
                var r = this._getDimension();
                tt(this._element).removeClass(ht).addClass(ct),
                  (this._element.style[r] = 0) < this._triggerArray.length &&
                    tt(this._triggerArray)
                      .removeClass(ut)
                      .attr("aria-expanded", !0),
                  this.setTransitioning(!0);
                var s = "scroll" + (r[0].toUpperCase() + r.slice(1)),
                  o = Cn.getTransitionDurationFromElement(this._element);
                tt(this._element)
                  .one(Cn.TRANSITION_END, function () {
                    tt(n._element).removeClass(ct).addClass(ht).addClass(lt),
                      (n._element.style[r] = ""),
                      n.setTransitioning(!1),
                      tt(n._element).trigger(at.SHOWN);
                  })
                  .emulateTransitionEnd(o),
                  (this._element.style[r] = this._element[s] + "px");
              }
            }
          }),
          (t.hide = function () {
            var t = this;
            if (!this._isTransitioning && tt(this._element).hasClass(lt)) {
              var e = tt.Event(at.HIDE);
              if ((tt(this._element).trigger(e), !e.isDefaultPrevented())) {
                var n = this._getDimension();
                if (
                  ((this._element.style[n] =
                    this._element.getBoundingClientRect()[n] + "px"),
                  Cn.reflow(this._element),
                  tt(this._element)
                    .addClass(ct)
                    .removeClass(ht)
                    .removeClass(lt),
                  0 < this._triggerArray.length)
                )
                  for (var i = 0; i < this._triggerArray.length; i++) {
                    var r = this._triggerArray[i],
                      s = Cn.getSelectorFromElement(r);
                    if (null !== s)
                      tt(s).hasClass(lt) ||
                        tt(r).addClass(ut).attr("aria-expanded", !1);
                  }
                this.setTransitioning(!0);
                this._element.style[n] = "";
                var o = Cn.getTransitionDurationFromElement(this._element);
                tt(this._element)
                  .one(Cn.TRANSITION_END, function () {
                    t.setTransitioning(!1),
                      tt(t._element)
                        .removeClass(ct)
                        .addClass(ht)
                        .trigger(at.HIDDEN);
                  })
                  .emulateTransitionEnd(o);
              }
            }
          }),
          (t.setTransitioning = function (t) {
            this._isTransitioning = t;
          }),
          (t.dispose = function () {
            tt.removeData(this._element, nt),
              (this._config = null),
              (this._parent = null),
              (this._element = null),
              (this._triggerArray = null),
              (this._isTransitioning = null);
          }),
          (t._getConfig = function (t) {
            return (
              ((t = h({}, st, t)).toggle = Boolean(t.toggle)),
              Cn.typeCheckConfig(et, t, ot),
              t
            );
          }),
          (t._getDimension = function () {
            return tt(this._element).hasClass(ft) ? ft : dt;
          }),
          (t._getParent = function () {
            var n = this,
              t = null;
            Cn.isElement(this._config.parent)
              ? ((t = this._config.parent),
                "undefined" != typeof this._config.parent.jquery &&
                  (t = this._config.parent[0]))
              : (t = tt(this._config.parent)[0]);
            var e =
              '[data-toggle="collapse"][data-parent="' +
              this._config.parent +
              '"]';
            return (
              tt(t)
                .find(e)
                .each(function (t, e) {
                  n._addAriaAndCollapsedClass(a._getTargetFromElement(e), [e]);
                }),
              t
            );
          }),
          (t._addAriaAndCollapsedClass = function (t, e) {
            if (t) {
              var n = tt(t).hasClass(lt);
              0 < e.length &&
                tt(e).toggleClass(ut, !n).attr("aria-expanded", n);
            }
          }),
          (a._getTargetFromElement = function (t) {
            var e = Cn.getSelectorFromElement(t);
            return e ? tt(e)[0] : null;
          }),
          (a._jQueryInterface = function (i) {
            return this.each(function () {
              var t = tt(this),
                e = t.data(nt),
                n = h({}, st, t.data(), "object" == typeof i && i ? i : {});
              if (
                (!e && n.toggle && /show|hide/.test(i) && (n.toggle = !1),
                e || ((e = new a(this, n)), t.data(nt, e)),
                "string" == typeof i)
              ) {
                if ("undefined" == typeof e[i])
                  throw new TypeError('No method named "' + i + '"');
                e[i]();
              }
            });
          }),
          o(a, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
            {
              key: "Default",
              get: function () {
                return st;
              },
            },
          ]),
          a
        );
      })()),
      tt(document).on(at.CLICK_DATA_API, _t.DATA_TOGGLE, function (t) {
        "A" === t.currentTarget.tagName && t.preventDefault();
        var n = tt(this),
          e = Cn.getSelectorFromElement(this);
        tt(e).each(function () {
          var t = tt(this),
            e = t.data(nt) ? "toggle" : n.data();
          gt._jQueryInterface.call(t, e);
        });
      }),
      (tt.fn[et] = gt._jQueryInterface),
      (tt.fn[et].Constructor = gt),
      (tt.fn[et].noConflict = function () {
        return (tt.fn[et] = rt), gt._jQueryInterface;
      }),
      gt),
    Sn =
      ((pt = "dropdown"),
      (Et = "." + (vt = "bs.dropdown")),
      (yt = ".data-api"),
      (Tt = (mt = e).fn[pt]),
      (Ct = new RegExp("38|40|27")),
      (It = {
        HIDE: "hide" + Et,
        HIDDEN: "hidden" + Et,
        SHOW: "show" + Et,
        SHOWN: "shown" + Et,
        CLICK: "click" + Et,
        CLICK_DATA_API: "click" + Et + yt,
        KEYDOWN_DATA_API: "keydown" + Et + yt,
        KEYUP_DATA_API: "keyup" + Et + yt,
      }),
      (At = "disabled"),
      (Dt = "show"),
      (bt = "dropup"),
      (St = "dropright"),
      (wt = "dropleft"),
      (Nt = "dropdown-menu-right"),
      (Ot = "position-static"),
      (kt = '[data-toggle="dropdown"]'),
      (Pt = ".dropdown form"),
      (Lt = ".dropdown-menu"),
      (jt = ".navbar-nav"),
      (Rt = ".dropdown-menu .dropdown-item:not(.disabled):not(:disabled)"),
      (Ht = "top-start"),
      (Wt = "top-end"),
      (Mt = "bottom-start"),
      (xt = "bottom-end"),
      (Ut = "right-start"),
      (Kt = "left-start"),
      (Ft = {
        offset: 0,
        flip: !0,
        boundary: "scrollParent",
        reference: "toggle",
        display: "dynamic",
      }),
      (Vt = {
        offset: "(number|string|function)",
        flip: "boolean",
        boundary: "(string|element)",
        reference: "(string|element)",
        display: "string",
      }),
      (Qt = (function () {
        function l(t, e) {
          (this._element = t),
            (this._popper = null),
            (this._config = this._getConfig(e)),
            (this._menu = this._getMenuElement()),
            (this._inNavbar = this._detectNavbar()),
            this._addEventListeners();
        }
        var t = l.prototype;
        return (
          (t.toggle = function () {
            if (!this._element.disabled && !mt(this._element).hasClass(At)) {
              var t = l._getParentFromElement(this._element),
                e = mt(this._menu).hasClass(Dt);
              if ((l._clearMenus(), !e)) {
                var n = { relatedTarget: this._element },
                  i = mt.Event(It.SHOW, n);
                if ((mt(t).trigger(i), !i.isDefaultPrevented())) {
                  if (!this._inNavbar) {
                    if ("undefined" == typeof c)
                      throw new TypeError(
                        "Bootstrap dropdown require Popper.js (https://popper.js.org)"
                      );
                    var r = this._element;
                    "parent" === this._config.reference
                      ? (r = t)
                      : Cn.isElement(this._config.reference) &&
                        ((r = this._config.reference),
                        "undefined" != typeof this._config.reference.jquery &&
                          (r = this._config.reference[0])),
                      "scrollParent" !== this._config.boundary &&
                        mt(t).addClass(Ot),
                      (this._popper = new c(
                        r,
                        this._menu,
                        this._getPopperConfig()
                      ));
                  }
                  "ontouchstart" in document.documentElement &&
                    0 === mt(t).closest(jt).length &&
                    mt(document.body).children().on("mouseover", null, mt.noop),
                    this._element.focus(),
                    this._element.setAttribute("aria-expanded", !0),
                    mt(this._menu).toggleClass(Dt),
                    mt(t).toggleClass(Dt).trigger(mt.Event(It.SHOWN, n));
                }
              }
            }
          }),
          (t.dispose = function () {
            mt.removeData(this._element, vt),
              mt(this._element).off(Et),
              (this._element = null),
              (this._menu = null) !== this._popper &&
                (this._popper.destroy(), (this._popper = null));
          }),
          (t.update = function () {
            (this._inNavbar = this._detectNavbar()),
              null !== this._popper && this._popper.scheduleUpdate();
          }),
          (t._addEventListeners = function () {
            var e = this;
            mt(this._element).on(It.CLICK, function (t) {
              t.preventDefault(), t.stopPropagation(), e.toggle();
            });
          }),
          (t._getConfig = function (t) {
            return (
              (t = h(
                {},
                this.constructor.Default,
                mt(this._element).data(),
                t
              )),
              Cn.typeCheckConfig(pt, t, this.constructor.DefaultType),
              t
            );
          }),
          (t._getMenuElement = function () {
            if (!this._menu) {
              var t = l._getParentFromElement(this._element);
              this._menu = mt(t).find(Lt)[0];
            }
            return this._menu;
          }),
          (t._getPlacement = function () {
            var t = mt(this._element).parent(),
              e = Mt;
            return (
              t.hasClass(bt)
                ? ((e = Ht), mt(this._menu).hasClass(Nt) && (e = Wt))
                : t.hasClass(St)
                  ? (e = Ut)
                  : t.hasClass(wt)
                    ? (e = Kt)
                    : mt(this._menu).hasClass(Nt) && (e = xt),
              e
            );
          }),
          (t._detectNavbar = function () {
            return 0 < mt(this._element).closest(".navbar").length;
          }),
          (t._getPopperConfig = function () {
            var e = this,
              t = {};
            "function" == typeof this._config.offset
              ? (t.fn = function (t) {
                  return (
                    (t.offsets = h(
                      {},
                      t.offsets,
                      e._config.offset(t.offsets) || {}
                    )),
                    t
                  );
                })
              : (t.offset = this._config.offset);
            var n = {
              placement: this._getPlacement(),
              modifiers: {
                offset: t,
                flip: { enabled: this._config.flip },
                preventOverflow: { boundariesElement: this._config.boundary },
              },
            };
            return (
              "static" === this._config.display &&
                (n.modifiers.applyStyle = { enabled: !1 }),
              n
            );
          }),
          (l._jQueryInterface = function (e) {
            return this.each(function () {
              var t = mt(this).data(vt);
              if (
                (t ||
                  ((t = new l(this, "object" == typeof e ? e : null)),
                  mt(this).data(vt, t)),
                "string" == typeof e)
              ) {
                if ("undefined" == typeof t[e])
                  throw new TypeError('No method named "' + e + '"');
                t[e]();
              }
            });
          }),
          (l._clearMenus = function (t) {
            if (!t || (3 !== t.which && ("keyup" !== t.type || 9 === t.which)))
              for (var e = mt.makeArray(mt(kt)), n = 0; n < e.length; n++) {
                var i = l._getParentFromElement(e[n]),
                  r = mt(e[n]).data(vt),
                  s = { relatedTarget: e[n] };
                if (r) {
                  var o = r._menu;
                  if (
                    mt(i).hasClass(Dt) &&
                    !(
                      t &&
                      (("click" === t.type &&
                        /input|textarea/i.test(t.target.tagName)) ||
                        ("keyup" === t.type && 9 === t.which)) &&
                      mt.contains(i, t.target)
                    )
                  ) {
                    var a = mt.Event(It.HIDE, s);
                    mt(i).trigger(a),
                      a.isDefaultPrevented() ||
                        ("ontouchstart" in document.documentElement &&
                          mt(document.body)
                            .children()
                            .off("mouseover", null, mt.noop),
                        e[n].setAttribute("aria-expanded", "false"),
                        mt(o).removeClass(Dt),
                        mt(i).removeClass(Dt).trigger(mt.Event(It.HIDDEN, s)));
                  }
                }
              }
          }),
          (l._getParentFromElement = function (t) {
            var e,
              n = Cn.getSelectorFromElement(t);
            return n && (e = mt(n)[0]), e || t.parentNode;
          }),
          (l._dataApiKeydownHandler = function (t) {
            if (
              (/input|textarea/i.test(t.target.tagName)
                ? !(
                    32 === t.which ||
                    (27 !== t.which &&
                      ((40 !== t.which && 38 !== t.which) ||
                        mt(t.target).closest(Lt).length))
                  )
                : Ct.test(t.which)) &&
              (t.preventDefault(),
              t.stopPropagation(),
              !this.disabled && !mt(this).hasClass(At))
            ) {
              var e = l._getParentFromElement(this),
                n = mt(e).hasClass(Dt);
              if (
                (n || (27 === t.which && 32 === t.which)) &&
                (!n || (27 !== t.which && 32 !== t.which))
              ) {
                var i = mt(e).find(Rt).get();
                if (0 !== i.length) {
                  var r = i.indexOf(t.target);
                  38 === t.which && 0 < r && r--,
                    40 === t.which && r < i.length - 1 && r++,
                    r < 0 && (r = 0),
                    i[r].focus();
                }
              } else {
                if (27 === t.which) {
                  var s = mt(e).find(kt)[0];
                  mt(s).trigger("focus");
                }
                mt(this).trigger("click");
              }
            }
          }),
          o(l, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
            {
              key: "Default",
              get: function () {
                return Ft;
              },
            },
            {
              key: "DefaultType",
              get: function () {
                return Vt;
              },
            },
          ]),
          l
        );
      })()),
      mt(document)
        .on(It.KEYDOWN_DATA_API, kt, Qt._dataApiKeydownHandler)
        .on(It.KEYDOWN_DATA_API, Lt, Qt._dataApiKeydownHandler)
        .on(It.CLICK_DATA_API + " " + It.KEYUP_DATA_API, Qt._clearMenus)
        .on(It.CLICK_DATA_API, kt, function (t) {
          t.preventDefault(),
            t.stopPropagation(),
            Qt._jQueryInterface.call(mt(this), "toggle");
        })
        .on(It.CLICK_DATA_API, Pt, function (t) {
          t.stopPropagation();
        }),
      (mt.fn[pt] = Qt._jQueryInterface),
      (mt.fn[pt].Constructor = Qt),
      (mt.fn[pt].noConflict = function () {
        return (mt.fn[pt] = Tt), Qt._jQueryInterface;
      }),
      Qt),
    wn =
      ((Yt = "modal"),
      (qt = "." + (Gt = "bs.modal")),
      (zt = (Bt = e).fn[Yt]),
      (Xt = { backdrop: !0, keyboard: !0, focus: !0, show: !0 }),
      (Jt = {
        backdrop: "(boolean|string)",
        keyboard: "boolean",
        focus: "boolean",
        show: "boolean",
      }),
      (Zt = {
        HIDE: "hide" + qt,
        HIDDEN: "hidden" + qt,
        SHOW: "show" + qt,
        SHOWN: "shown" + qt,
        FOCUSIN: "focusin" + qt,
        RESIZE: "resize" + qt,
        CLICK_DISMISS: "click.dismiss" + qt,
        KEYDOWN_DISMISS: "keydown.dismiss" + qt,
        MOUSEUP_DISMISS: "mouseup.dismiss" + qt,
        MOUSEDOWN_DISMISS: "mousedown.dismiss" + qt,
        CLICK_DATA_API: "click" + qt + ".data-api",
      }),
      ($t = "modal-scrollbar-measure"),
      (te = "modal-backdrop"),
      (ee = "modal-open"),
      (ne = "fade"),
      (ie = "show"),
      (re = {
        DIALOG: ".modal-dialog",
        DATA_TOGGLE: '[data-toggle="modal"]',
        DATA_DISMISS: '[data-dismiss="modal"]',
        FIXED_CONTENT: ".fixed-top, .fixed-bottom, .is-fixed, .sticky-top",
        STICKY_CONTENT: ".sticky-top",
        NAVBAR_TOGGLER: ".navbar-toggler",
      }),
      (se = (function () {
        function r(t, e) {
          (this._config = this._getConfig(e)),
            (this._element = t),
            (this._dialog = Bt(t).find(re.DIALOG)[0]),
            (this._backdrop = null),
            (this._isShown = !1),
            (this._isBodyOverflowing = !1),
            (this._ignoreBackdropClick = !1),
            (this._scrollbarWidth = 0);
        }
        var t = r.prototype;
        return (
          (t.toggle = function (t) {
            return this._isShown ? this.hide() : this.show(t);
          }),
          (t.show = function (t) {
            var e = this;
            if (!this._isTransitioning && !this._isShown) {
              Bt(this._element).hasClass(ne) && (this._isTransitioning = !0);
              var n = Bt.Event(Zt.SHOW, { relatedTarget: t });
              Bt(this._element).trigger(n),
                this._isShown ||
                  n.isDefaultPrevented() ||
                  ((this._isShown = !0),
                  this._checkScrollbar(),
                  this._setScrollbar(),
                  this._adjustDialog(),
                  Bt(document.body).addClass(ee),
                  this._setEscapeEvent(),
                  this._setResizeEvent(),
                  Bt(this._element).on(
                    Zt.CLICK_DISMISS,
                    re.DATA_DISMISS,
                    function (t) {
                      return e.hide(t);
                    }
                  ),
                  Bt(this._dialog).on(Zt.MOUSEDOWN_DISMISS, function () {
                    Bt(e._element).one(Zt.MOUSEUP_DISMISS, function (t) {
                      Bt(t.target).is(e._element) &&
                        (e._ignoreBackdropClick = !0);
                    });
                  }),
                  this._showBackdrop(function () {
                    return e._showElement(t);
                  }));
            }
          }),
          (t.hide = function (t) {
            var e = this;
            if (
              (t && t.preventDefault(), !this._isTransitioning && this._isShown)
            ) {
              var n = Bt.Event(Zt.HIDE);
              if (
                (Bt(this._element).trigger(n),
                this._isShown && !n.isDefaultPrevented())
              ) {
                this._isShown = !1;
                var i = Bt(this._element).hasClass(ne);
                if (
                  (i && (this._isTransitioning = !0),
                  this._setEscapeEvent(),
                  this._setResizeEvent(),
                  Bt(document).off(Zt.FOCUSIN),
                  Bt(this._element).removeClass(ie),
                  Bt(this._element).off(Zt.CLICK_DISMISS),
                  Bt(this._dialog).off(Zt.MOUSEDOWN_DISMISS),
                  i)
                ) {
                  var r = Cn.getTransitionDurationFromElement(this._element);
                  Bt(this._element)
                    .one(Cn.TRANSITION_END, function (t) {
                      return e._hideModal(t);
                    })
                    .emulateTransitionEnd(r);
                } else this._hideModal();
              }
            }
          }),
          (t.dispose = function () {
            Bt.removeData(this._element, Gt),
              Bt(window, document, this._element, this._backdrop).off(qt),
              (this._config = null),
              (this._element = null),
              (this._dialog = null),
              (this._backdrop = null),
              (this._isShown = null),
              (this._isBodyOverflowing = null),
              (this._ignoreBackdropClick = null),
              (this._scrollbarWidth = null);
          }),
          (t.handleUpdate = function () {
            this._adjustDialog();
          }),
          (t._getConfig = function (t) {
            return (t = h({}, Xt, t)), Cn.typeCheckConfig(Yt, t, Jt), t;
          }),
          (t._showElement = function (t) {
            var e = this,
              n = Bt(this._element).hasClass(ne);
            (this._element.parentNode &&
              this._element.parentNode.nodeType === Node.ELEMENT_NODE) ||
              document.body.appendChild(this._element),
              (this._element.style.display = "block"),
              this._element.removeAttribute("aria-hidden"),
              (this._element.scrollTop = 0),
              n && Cn.reflow(this._element),
              Bt(this._element).addClass(ie),
              this._config.focus && this._enforceFocus();
            var i = Bt.Event(Zt.SHOWN, { relatedTarget: t }),
              r = function () {
                e._config.focus && e._element.focus(),
                  (e._isTransitioning = !1),
                  Bt(e._element).trigger(i);
              };
            if (n) {
              var s = Cn.getTransitionDurationFromElement(this._element);
              Bt(this._dialog)
                .one(Cn.TRANSITION_END, r)
                .emulateTransitionEnd(s);
            } else r();
          }),
          (t._enforceFocus = function () {
            var e = this;
            Bt(document)
              .off(Zt.FOCUSIN)
              .on(Zt.FOCUSIN, function (t) {
                document !== t.target &&
                  e._element !== t.target &&
                  0 === Bt(e._element).has(t.target).length &&
                  e._element.focus();
              });
          }),
          (t._setEscapeEvent = function () {
            var e = this;
            this._isShown && this._config.keyboard
              ? Bt(this._element).on(Zt.KEYDOWN_DISMISS, function (t) {
                  27 === t.which && (t.preventDefault(), e.hide());
                })
              : this._isShown || Bt(this._element).off(Zt.KEYDOWN_DISMISS);
          }),
          (t._setResizeEvent = function () {
            var e = this;
            this._isShown
              ? Bt(window).on(Zt.RESIZE, function (t) {
                  return e.handleUpdate(t);
                })
              : Bt(window).off(Zt.RESIZE);
          }),
          (t._hideModal = function () {
            var t = this;
            (this._element.style.display = "none"),
              this._element.setAttribute("aria-hidden", !0),
              (this._isTransitioning = !1),
              this._showBackdrop(function () {
                Bt(document.body).removeClass(ee),
                  t._resetAdjustments(),
                  t._resetScrollbar(),
                  Bt(t._element).trigger(Zt.HIDDEN);
              });
          }),
          (t._removeBackdrop = function () {
            this._backdrop &&
              (Bt(this._backdrop).remove(), (this._backdrop = null));
          }),
          (t._showBackdrop = function (t) {
            var e = this,
              n = Bt(this._element).hasClass(ne) ? ne : "";
            if (this._isShown && this._config.backdrop) {
              if (
                ((this._backdrop = document.createElement("div")),
                (this._backdrop.className = te),
                n && Bt(this._backdrop).addClass(n),
                Bt(this._backdrop).appendTo(document.body),
                Bt(this._element).on(Zt.CLICK_DISMISS, function (t) {
                  e._ignoreBackdropClick
                    ? (e._ignoreBackdropClick = !1)
                    : t.target === t.currentTarget &&
                      ("static" === e._config.backdrop
                        ? e._element.focus()
                        : e.hide());
                }),
                n && Cn.reflow(this._backdrop),
                Bt(this._backdrop).addClass(ie),
                !t)
              )
                return;
              if (!n) return void t();
              var i = Cn.getTransitionDurationFromElement(this._backdrop);
              Bt(this._backdrop)
                .one(Cn.TRANSITION_END, t)
                .emulateTransitionEnd(i);
            } else if (!this._isShown && this._backdrop) {
              Bt(this._backdrop).removeClass(ie);
              var r = function () {
                e._removeBackdrop(), t && t();
              };
              if (Bt(this._element).hasClass(ne)) {
                var s = Cn.getTransitionDurationFromElement(this._backdrop);
                Bt(this._backdrop)
                  .one(Cn.TRANSITION_END, r)
                  .emulateTransitionEnd(s);
              } else r();
            } else t && t();
          }),
          (t._adjustDialog = function () {
            var t =
              this._element.scrollHeight >
              document.documentElement.clientHeight;
            !this._isBodyOverflowing &&
              t &&
              (this._element.style.paddingLeft = this._scrollbarWidth + "px"),
              this._isBodyOverflowing &&
                !t &&
                (this._element.style.paddingRight =
                  this._scrollbarWidth + "px");
          }),
          (t._resetAdjustments = function () {
            (this._element.style.paddingLeft = ""),
              (this._element.style.paddingRight = "");
          }),
          (t._checkScrollbar = function () {
            var t = document.body.getBoundingClientRect();
            (this._isBodyOverflowing = t.left + t.right < window.innerWidth),
              (this._scrollbarWidth = this._getScrollbarWidth());
          }),
          (t._setScrollbar = function () {
            var r = this;
            if (this._isBodyOverflowing) {
              Bt(re.FIXED_CONTENT).each(function (t, e) {
                var n = Bt(e)[0].style.paddingRight,
                  i = Bt(e).css("padding-right");
                Bt(e)
                  .data("padding-right", n)
                  .css(
                    "padding-right",
                    parseFloat(i) + r._scrollbarWidth + "px"
                  );
              }),
                Bt(re.STICKY_CONTENT).each(function (t, e) {
                  var n = Bt(e)[0].style.marginRight,
                    i = Bt(e).css("margin-right");
                  Bt(e)
                    .data("margin-right", n)
                    .css(
                      "margin-right",
                      parseFloat(i) - r._scrollbarWidth + "px"
                    );
                }),
                Bt(re.NAVBAR_TOGGLER).each(function (t, e) {
                  var n = Bt(e)[0].style.marginRight,
                    i = Bt(e).css("margin-right");
                  Bt(e)
                    .data("margin-right", n)
                    .css(
                      "margin-right",
                      parseFloat(i) + r._scrollbarWidth + "px"
                    );
                });
              var t = document.body.style.paddingRight,
                e = Bt(document.body).css("padding-right");
              Bt(document.body)
                .data("padding-right", t)
                .css(
                  "padding-right",
                  parseFloat(e) + this._scrollbarWidth + "px"
                );
            }
          }),
          (t._resetScrollbar = function () {
            Bt(re.FIXED_CONTENT).each(function (t, e) {
              var n = Bt(e).data("padding-right");
              "undefined" != typeof n &&
                Bt(e).css("padding-right", n).removeData("padding-right");
            }),
              Bt(re.STICKY_CONTENT + ", " + re.NAVBAR_TOGGLER).each(
                function (t, e) {
                  var n = Bt(e).data("margin-right");
                  "undefined" != typeof n &&
                    Bt(e).css("margin-right", n).removeData("margin-right");
                }
              );
            var t = Bt(document.body).data("padding-right");
            "undefined" != typeof t &&
              Bt(document.body)
                .css("padding-right", t)
                .removeData("padding-right");
          }),
          (t._getScrollbarWidth = function () {
            var t = document.createElement("div");
            (t.className = $t), document.body.appendChild(t);
            var e = t.getBoundingClientRect().width - t.clientWidth;
            return document.body.removeChild(t), e;
          }),
          (r._jQueryInterface = function (n, i) {
            return this.each(function () {
              var t = Bt(this).data(Gt),
                e = h(
                  {},
                  Xt,
                  Bt(this).data(),
                  "object" == typeof n && n ? n : {}
                );
              if (
                (t || ((t = new r(this, e)), Bt(this).data(Gt, t)),
                "string" == typeof n)
              ) {
                if ("undefined" == typeof t[n])
                  throw new TypeError('No method named "' + n + '"');
                t[n](i);
              } else e.show && t.show(i);
            });
          }),
          o(r, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
            {
              key: "Default",
              get: function () {
                return Xt;
              },
            },
          ]),
          r
        );
      })()),
      Bt(document).on(Zt.CLICK_DATA_API, re.DATA_TOGGLE, function (t) {
        var e,
          n = this,
          i = Cn.getSelectorFromElement(this);
        i && (e = Bt(i)[0]);
        var r = Bt(e).data(Gt)
          ? "toggle"
          : h({}, Bt(e).data(), Bt(this).data());
        ("A" !== this.tagName && "AREA" !== this.tagName) || t.preventDefault();
        var s = Bt(e).one(Zt.SHOW, function (t) {
          t.isDefaultPrevented() ||
            s.one(Zt.HIDDEN, function () {
              Bt(n).is(":visible") && n.focus();
            });
        });
        se._jQueryInterface.call(Bt(e), r, this);
      }),
      (Bt.fn[Yt] = se._jQueryInterface),
      (Bt.fn[Yt].Constructor = se),
      (Bt.fn[Yt].noConflict = function () {
        return (Bt.fn[Yt] = zt), se._jQueryInterface;
      }),
      se),
    Nn =
      ((ae = "tooltip"),
      (he = "." + (le = "bs.tooltip")),
      (ce = (oe = e).fn[ae]),
      (ue = "bs-tooltip"),
      (fe = new RegExp("(^|\\s)" + ue + "\\S+", "g")),
      (ge = {
        animation: !0,
        template:
          '<div class="tooltip" role="tooltip"><div class="arrow"></div><div class="tooltip-inner"></div></div>',
        trigger: "hover focus",
        title: "",
        delay: 0,
        html: !(_e = {
          AUTO: "auto",
          TOP: "top",
          RIGHT: "right",
          BOTTOM: "bottom",
          LEFT: "left",
        }),
        selector: !(de = {
          animation: "boolean",
          template: "string",
          title: "(string|element|function)",
          trigger: "string",
          delay: "(number|object)",
          html: "boolean",
          selector: "(string|boolean)",
          placement: "(string|function)",
          offset: "(number|string)",
          container: "(string|element|boolean)",
          fallbackPlacement: "(string|array)",
          boundary: "(string|element)",
        }),
        placement: "top",
        offset: 0,
        container: !1,
        fallbackPlacement: "flip",
        boundary: "scrollParent",
      }),
      (pe = "out"),
      (ve = {
        HIDE: "hide" + he,
        HIDDEN: "hidden" + he,
        SHOW: (me = "show") + he,
        SHOWN: "shown" + he,
        INSERTED: "inserted" + he,
        CLICK: "click" + he,
        FOCUSIN: "focusin" + he,
        FOCUSOUT: "focusout" + he,
        MOUSEENTER: "mouseenter" + he,
        MOUSELEAVE: "mouseleave" + he,
      }),
      (Ee = "fade"),
      (ye = "show"),
      (Te = ".tooltip-inner"),
      (Ce = ".arrow"),
      (Ie = "hover"),
      (Ae = "focus"),
      (De = "click"),
      (be = "manual"),
      (Se = (function () {
        function i(t, e) {
          if ("undefined" == typeof c)
            throw new TypeError(
              "Bootstrap tooltips require Popper.js (https://popper.js.org)"
            );
          (this._isEnabled = !0),
            (this._timeout = 0),
            (this._hoverState = ""),
            (this._activeTrigger = {}),
            (this._popper = null),
            (this.element = t),
            (this.config = this._getConfig(e)),
            (this.tip = null),
            this._setListeners();
        }
        var t = i.prototype;
        return (
          (t.enable = function () {
            this._isEnabled = !0;
          }),
          (t.disable = function () {
            this._isEnabled = !1;
          }),
          (t.toggleEnabled = function () {
            this._isEnabled = !this._isEnabled;
          }),
          (t.toggle = function (t) {
            if (this._isEnabled)
              if (t) {
                var e = this.constructor.DATA_KEY,
                  n = oe(t.currentTarget).data(e);
                n ||
                  ((n = new this.constructor(
                    t.currentTarget,
                    this._getDelegateConfig()
                  )),
                  oe(t.currentTarget).data(e, n)),
                  (n._activeTrigger.click = !n._activeTrigger.click),
                  n._isWithActiveTrigger()
                    ? n._enter(null, n)
                    : n._leave(null, n);
              } else {
                if (oe(this.getTipElement()).hasClass(ye))
                  return void this._leave(null, this);
                this._enter(null, this);
              }
          }),
          (t.dispose = function () {
            clearTimeout(this._timeout),
              oe.removeData(this.element, this.constructor.DATA_KEY),
              oe(this.element).off(this.constructor.EVENT_KEY),
              oe(this.element).closest(".modal").off("hide.bs.modal"),
              this.tip && oe(this.tip).remove(),
              (this._isEnabled = null),
              (this._timeout = null),
              (this._hoverState = null),
              (this._activeTrigger = null) !== this._popper &&
                this._popper.destroy(),
              (this._popper = null),
              (this.element = null),
              (this.config = null),
              (this.tip = null);
          }),
          (t.show = function () {
            var e = this;
            if ("none" === oe(this.element).css("display"))
              throw new Error("Please use show on visible elements");
            var t = oe.Event(this.constructor.Event.SHOW);
            if (this.isWithContent() && this._isEnabled) {
              oe(this.element).trigger(t);
              var n = oe.contains(
                this.element.ownerDocument.documentElement,
                this.element
              );
              if (t.isDefaultPrevented() || !n) return;
              var i = this.getTipElement(),
                r = Cn.getUID(this.constructor.NAME);
              i.setAttribute("id", r),
                this.element.setAttribute("aria-describedby", r),
                this.setContent(),
                this.config.animation && oe(i).addClass(Ee);
              var s =
                  "function" == typeof this.config.placement
                    ? this.config.placement.call(this, i, this.element)
                    : this.config.placement,
                o = this._getAttachment(s);
              this.addAttachmentClass(o);
              var a =
                !1 === this.config.container
                  ? document.body
                  : oe(this.config.container);
              oe(i).data(this.constructor.DATA_KEY, this),
                oe.contains(
                  this.element.ownerDocument.documentElement,
                  this.tip
                ) || oe(i).appendTo(a),
                oe(this.element).trigger(this.constructor.Event.INSERTED),
                (this._popper = new c(this.element, i, {
                  placement: o,
                  modifiers: {
                    offset: { offset: this.config.offset },
                    flip: { behavior: this.config.fallbackPlacement },
                    arrow: { element: Ce },
                    preventOverflow: {
                      boundariesElement: this.config.boundary,
                    },
                  },
                  onCreate: function (t) {
                    t.originalPlacement !== t.placement &&
                      e._handlePopperPlacementChange(t);
                  },
                  onUpdate: function (t) {
                    e._handlePopperPlacementChange(t);
                  },
                })),
                oe(i).addClass(ye),
                "ontouchstart" in document.documentElement &&
                  oe(document.body).children().on("mouseover", null, oe.noop);
              var l = function () {
                e.config.animation && e._fixTransition();
                var t = e._hoverState;
                (e._hoverState = null),
                  oe(e.element).trigger(e.constructor.Event.SHOWN),
                  t === pe && e._leave(null, e);
              };
              if (oe(this.tip).hasClass(Ee)) {
                var h = Cn.getTransitionDurationFromElement(this.tip);
                oe(this.tip).one(Cn.TRANSITION_END, l).emulateTransitionEnd(h);
              } else l();
            }
          }),
          (t.hide = function (t) {
            var e = this,
              n = this.getTipElement(),
              i = oe.Event(this.constructor.Event.HIDE),
              r = function () {
                e._hoverState !== me &&
                  n.parentNode &&
                  n.parentNode.removeChild(n),
                  e._cleanTipClass(),
                  e.element.removeAttribute("aria-describedby"),
                  oe(e.element).trigger(e.constructor.Event.HIDDEN),
                  null !== e._popper && e._popper.destroy(),
                  t && t();
              };
            if ((oe(this.element).trigger(i), !i.isDefaultPrevented())) {
              if (
                (oe(n).removeClass(ye),
                "ontouchstart" in document.documentElement &&
                  oe(document.body).children().off("mouseover", null, oe.noop),
                (this._activeTrigger[De] = !1),
                (this._activeTrigger[Ae] = !1),
                (this._activeTrigger[Ie] = !1),
                oe(this.tip).hasClass(Ee))
              ) {
                var s = Cn.getTransitionDurationFromElement(n);
                oe(n).one(Cn.TRANSITION_END, r).emulateTransitionEnd(s);
              } else r();
              this._hoverState = "";
            }
          }),
          (t.update = function () {
            null !== this._popper && this._popper.scheduleUpdate();
          }),
          (t.isWithContent = function () {
            return Boolean(this.getTitle());
          }),
          (t.addAttachmentClass = function (t) {
            oe(this.getTipElement()).addClass(ue + "-" + t);
          }),
          (t.getTipElement = function () {
            return (
              (this.tip = this.tip || oe(this.config.template)[0]), this.tip
            );
          }),
          (t.setContent = function () {
            var t = oe(this.getTipElement());
            this.setElementContent(t.find(Te), this.getTitle()),
              t.removeClass(Ee + " " + ye);
          }),
          (t.setElementContent = function (t, e) {
            var n = this.config.html;
            "object" == typeof e && (e.nodeType || e.jquery)
              ? n
                ? oe(e).parent().is(t) || t.empty().append(e)
                : t.text(oe(e).text())
              : t[n ? "html" : "text"](e);
          }),
          (t.getTitle = function () {
            var t = this.element.getAttribute("data-original-title");
            return (
              t ||
                (t =
                  "function" == typeof this.config.title
                    ? this.config.title.call(this.element)
                    : this.config.title),
              t
            );
          }),
          (t._getAttachment = function (t) {
            return _e[t.toUpperCase()];
          }),
          (t._setListeners = function () {
            var i = this;
            this.config.trigger.split(" ").forEach(function (t) {
              if ("click" === t)
                oe(i.element).on(
                  i.constructor.Event.CLICK,
                  i.config.selector,
                  function (t) {
                    return i.toggle(t);
                  }
                );
              else if (t !== be) {
                var e =
                    t === Ie
                      ? i.constructor.Event.MOUSEENTER
                      : i.constructor.Event.FOCUSIN,
                  n =
                    t === Ie
                      ? i.constructor.Event.MOUSELEAVE
                      : i.constructor.Event.FOCUSOUT;
                oe(i.element)
                  .on(e, i.config.selector, function (t) {
                    return i._enter(t);
                  })
                  .on(n, i.config.selector, function (t) {
                    return i._leave(t);
                  });
              }
              oe(i.element)
                .closest(".modal")
                .on("hide.bs.modal", function () {
                  return i.hide();
                });
            }),
              this.config.selector
                ? (this.config = h({}, this.config, {
                    trigger: "manual",
                    selector: "",
                  }))
                : this._fixTitle();
          }),
          (t._fixTitle = function () {
            var t = typeof this.element.getAttribute("data-original-title");
            (this.element.getAttribute("title") || "string" !== t) &&
              (this.element.setAttribute(
                "data-original-title",
                this.element.getAttribute("title") || ""
              ),
              this.element.setAttribute("title", ""));
          }),
          (t._enter = function (t, e) {
            var n = this.constructor.DATA_KEY;
            (e = e || oe(t.currentTarget).data(n)) ||
              ((e = new this.constructor(
                t.currentTarget,
                this._getDelegateConfig()
              )),
              oe(t.currentTarget).data(n, e)),
              t && (e._activeTrigger["focusin" === t.type ? Ae : Ie] = !0),
              oe(e.getTipElement()).hasClass(ye) || e._hoverState === me
                ? (e._hoverState = me)
                : (clearTimeout(e._timeout),
                  (e._hoverState = me),
                  e.config.delay && e.config.delay.show
                    ? (e._timeout = setTimeout(function () {
                        e._hoverState === me && e.show();
                      }, e.config.delay.show))
                    : e.show());
          }),
          (t._leave = function (t, e) {
            var n = this.constructor.DATA_KEY;
            (e = e || oe(t.currentTarget).data(n)) ||
              ((e = new this.constructor(
                t.currentTarget,
                this._getDelegateConfig()
              )),
              oe(t.currentTarget).data(n, e)),
              t && (e._activeTrigger["focusout" === t.type ? Ae : Ie] = !1),
              e._isWithActiveTrigger() ||
                (clearTimeout(e._timeout),
                (e._hoverState = pe),
                e.config.delay && e.config.delay.hide
                  ? (e._timeout = setTimeout(function () {
                      e._hoverState === pe && e.hide();
                    }, e.config.delay.hide))
                  : e.hide());
          }),
          (t._isWithActiveTrigger = function () {
            for (var t in this._activeTrigger)
              if (this._activeTrigger[t]) return !0;
            return !1;
          }),
          (t._getConfig = function (t) {
            return (
              "number" ==
                typeof (t = h(
                  {},
                  this.constructor.Default,
                  oe(this.element).data(),
                  "object" == typeof t && t ? t : {}
                )).delay && (t.delay = { show: t.delay, hide: t.delay }),
              "number" == typeof t.title && (t.title = t.title.toString()),
              "number" == typeof t.content &&
                (t.content = t.content.toString()),
              Cn.typeCheckConfig(ae, t, this.constructor.DefaultType),
              t
            );
          }),
          (t._getDelegateConfig = function () {
            var t = {};
            if (this.config)
              for (var e in this.config)
                this.constructor.Default[e] !== this.config[e] &&
                  (t[e] = this.config[e]);
            return t;
          }),
          (t._cleanTipClass = function () {
            var t = oe(this.getTipElement()),
              e = t.attr("class").match(fe);
            null !== e && 0 < e.length && t.removeClass(e.join(""));
          }),
          (t._handlePopperPlacementChange = function (t) {
            this._cleanTipClass(),
              this.addAttachmentClass(this._getAttachment(t.placement));
          }),
          (t._fixTransition = function () {
            var t = this.getTipElement(),
              e = this.config.animation;
            null === t.getAttribute("x-placement") &&
              (oe(t).removeClass(Ee),
              (this.config.animation = !1),
              this.hide(),
              this.show(),
              (this.config.animation = e));
          }),
          (i._jQueryInterface = function (n) {
            return this.each(function () {
              var t = oe(this).data(le),
                e = "object" == typeof n && n;
              if (
                (t || !/dispose|hide/.test(n)) &&
                (t || ((t = new i(this, e)), oe(this).data(le, t)),
                "string" == typeof n)
              ) {
                if ("undefined" == typeof t[n])
                  throw new TypeError('No method named "' + n + '"');
                t[n]();
              }
            });
          }),
          o(i, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
            {
              key: "Default",
              get: function () {
                return ge;
              },
            },
            {
              key: "NAME",
              get: function () {
                return ae;
              },
            },
            {
              key: "DATA_KEY",
              get: function () {
                return le;
              },
            },
            {
              key: "Event",
              get: function () {
                return ve;
              },
            },
            {
              key: "EVENT_KEY",
              get: function () {
                return he;
              },
            },
            {
              key: "DefaultType",
              get: function () {
                return de;
              },
            },
          ]),
          i
        );
      })()),
      (oe.fn[ae] = Se._jQueryInterface),
      (oe.fn[ae].Constructor = Se),
      (oe.fn[ae].noConflict = function () {
        return (oe.fn[ae] = ce), Se._jQueryInterface;
      }),
      Se),
    On =
      ((Ne = "popover"),
      (ke = "." + (Oe = "bs.popover")),
      (Pe = (we = e).fn[Ne]),
      (Le = "bs-popover"),
      (je = new RegExp("(^|\\s)" + Le + "\\S+", "g")),
      (Re = h({}, Nn.Default, {
        placement: "right",
        trigger: "click",
        content: "",
        template:
          '<div class="popover" role="tooltip"><div class="arrow"></div><h3 class="popover-header"></h3><div class="popover-body"></div></div>',
      })),
      (He = h({}, Nn.DefaultType, { content: "(string|element|function)" })),
      (We = "fade"),
      (xe = ".popover-header"),
      (Ue = ".popover-body"),
      (Ke = {
        HIDE: "hide" + ke,
        HIDDEN: "hidden" + ke,
        SHOW: (Me = "show") + ke,
        SHOWN: "shown" + ke,
        INSERTED: "inserted" + ke,
        CLICK: "click" + ke,
        FOCUSIN: "focusin" + ke,
        FOCUSOUT: "focusout" + ke,
        MOUSEENTER: "mouseenter" + ke,
        MOUSELEAVE: "mouseleave" + ke,
      }),
      (Fe = (function (t) {
        var e, n;
        function i() {
          return t.apply(this, arguments) || this;
        }
        (n = t),
          ((e = i).prototype = Object.create(n.prototype)),
          ((e.prototype.constructor = e).__proto__ = n);
        var r = i.prototype;
        return (
          (r.isWithContent = function () {
            return this.getTitle() || this._getContent();
          }),
          (r.addAttachmentClass = function (t) {
            we(this.getTipElement()).addClass(Le + "-" + t);
          }),
          (r.getTipElement = function () {
            return (
              (this.tip = this.tip || we(this.config.template)[0]), this.tip
            );
          }),
          (r.setContent = function () {
            var t = we(this.getTipElement());
            this.setElementContent(t.find(xe), this.getTitle());
            var e = this._getContent();
            "function" == typeof e && (e = e.call(this.element)),
              this.setElementContent(t.find(Ue), e),
              t.removeClass(We + " " + Me);
          }),
          (r._getContent = function () {
            return (
              this.element.getAttribute("data-content") || this.config.content
            );
          }),
          (r._cleanTipClass = function () {
            var t = we(this.getTipElement()),
              e = t.attr("class").match(je);
            null !== e && 0 < e.length && t.removeClass(e.join(""));
          }),
          (i._jQueryInterface = function (n) {
            return this.each(function () {
              var t = we(this).data(Oe),
                e = "object" == typeof n ? n : null;
              if (
                (t || !/destroy|hide/.test(n)) &&
                (t || ((t = new i(this, e)), we(this).data(Oe, t)),
                "string" == typeof n)
              ) {
                if ("undefined" == typeof t[n])
                  throw new TypeError('No method named "' + n + '"');
                t[n]();
              }
            });
          }),
          o(i, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
            {
              key: "Default",
              get: function () {
                return Re;
              },
            },
            {
              key: "NAME",
              get: function () {
                return Ne;
              },
            },
            {
              key: "DATA_KEY",
              get: function () {
                return Oe;
              },
            },
            {
              key: "Event",
              get: function () {
                return Ke;
              },
            },
            {
              key: "EVENT_KEY",
              get: function () {
                return ke;
              },
            },
            {
              key: "DefaultType",
              get: function () {
                return He;
              },
            },
          ]),
          i
        );
      })(Nn)),
      (we.fn[Ne] = Fe._jQueryInterface),
      (we.fn[Ne].Constructor = Fe),
      (we.fn[Ne].noConflict = function () {
        return (we.fn[Ne] = Pe), Fe._jQueryInterface;
      }),
      Fe),
    kn =
      ((Qe = "scrollspy"),
      (Ye = "." + (Be = "bs.scrollspy")),
      (Ge = (Ve = e).fn[Qe]),
      (qe = { offset: 10, method: "auto", target: "" }),
      (ze = { offset: "number", method: "string", target: "(string|element)" }),
      (Xe = {
        ACTIVATE: "activate" + Ye,
        SCROLL: "scroll" + Ye,
        LOAD_DATA_API: "load" + Ye + ".data-api",
      }),
      (Je = "dropdown-item"),
      (Ze = "active"),
      ($e = {
        DATA_SPY: '[data-spy="scroll"]',
        ACTIVE: ".active",
        NAV_LIST_GROUP: ".nav, .list-group",
        NAV_LINKS: ".nav-link",
        NAV_ITEMS: ".nav-item",
        LIST_ITEMS: ".list-group-item",
        DROPDOWN: ".dropdown",
        DROPDOWN_ITEMS: ".dropdown-item",
        DROPDOWN_TOGGLE: ".dropdown-toggle",
      }),
      (tn = "offset"),
      (en = "position"),
      (nn = (function () {
        function n(t, e) {
          var n = this;
          (this._element = t),
            (this._scrollElement = "BODY" === t.tagName ? window : t),
            (this._config = this._getConfig(e)),
            (this._selector =
              this._config.target +
              " " +
              $e.NAV_LINKS +
              "," +
              this._config.target +
              " " +
              $e.LIST_ITEMS +
              "," +
              this._config.target +
              " " +
              $e.DROPDOWN_ITEMS),
            (this._offsets = []),
            (this._targets = []),
            (this._activeTarget = null),
            (this._scrollHeight = 0),
            Ve(this._scrollElement).on(Xe.SCROLL, function (t) {
              return n._process(t);
            }),
            this.refresh(),
            this._process();
        }
        var t = n.prototype;
        return (
          (t.refresh = function () {
            var e = this,
              t = this._scrollElement === this._scrollElement.window ? tn : en,
              r = "auto" === this._config.method ? t : this._config.method,
              s = r === en ? this._getScrollTop() : 0;
            (this._offsets = []),
              (this._targets = []),
              (this._scrollHeight = this._getScrollHeight()),
              Ve.makeArray(Ve(this._selector))
                .map(function (t) {
                  var e,
                    n = Cn.getSelectorFromElement(t);
                  if ((n && (e = Ve(n)[0]), e)) {
                    var i = e.getBoundingClientRect();
                    if (i.width || i.height) return [Ve(e)[r]().top + s, n];
                  }
                  return null;
                })
                .filter(function (t) {
                  return t;
                })
                .sort(function (t, e) {
                  return t[0] - e[0];
                })
                .forEach(function (t) {
                  e._offsets.push(t[0]), e._targets.push(t[1]);
                });
          }),
          (t.dispose = function () {
            Ve.removeData(this._element, Be),
              Ve(this._scrollElement).off(Ye),
              (this._element = null),
              (this._scrollElement = null),
              (this._config = null),
              (this._selector = null),
              (this._offsets = null),
              (this._targets = null),
              (this._activeTarget = null),
              (this._scrollHeight = null);
          }),
          (t._getConfig = function (t) {
            if (
              "string" !=
              typeof (t = h({}, qe, "object" == typeof t && t ? t : {})).target
            ) {
              var e = Ve(t.target).attr("id");
              e || ((e = Cn.getUID(Qe)), Ve(t.target).attr("id", e)),
                (t.target = "#" + e);
            }
            return Cn.typeCheckConfig(Qe, t, ze), t;
          }),
          (t._getScrollTop = function () {
            return this._scrollElement === window
              ? this._scrollElement.pageYOffset
              : this._scrollElement.scrollTop;
          }),
          (t._getScrollHeight = function () {
            return (
              this._scrollElement.scrollHeight ||
              Math.max(
                document.body.scrollHeight,
                document.documentElement.scrollHeight
              )
            );
          }),
          (t._getOffsetHeight = function () {
            return this._scrollElement === window
              ? window.innerHeight
              : this._scrollElement.getBoundingClientRect().height;
          }),
          (t._process = function () {
            var t = this._getScrollTop() + this._config.offset,
              e = this._getScrollHeight(),
              n = this._config.offset + e - this._getOffsetHeight();
            if ((this._scrollHeight !== e && this.refresh(), n <= t)) {
              var i = this._targets[this._targets.length - 1];
              this._activeTarget !== i && this._activate(i);
            } else {
              if (
                this._activeTarget &&
                t < this._offsets[0] &&
                0 < this._offsets[0]
              )
                return (this._activeTarget = null), void this._clear();
              for (var r = this._offsets.length; r--; ) {
                this._activeTarget !== this._targets[r] &&
                  t >= this._offsets[r] &&
                  ("undefined" == typeof this._offsets[r + 1] ||
                    t < this._offsets[r + 1]) &&
                  this._activate(this._targets[r]);
              }
            }
          }),
          (t._activate = function (e) {
            (this._activeTarget = e), this._clear();
            var t = this._selector.split(",");
            t = t.map(function (t) {
              return (
                t + '[data-target="' + e + '"],' + t + '[href="' + e + '"]'
              );
            });
            var n = Ve(t.join(","));
            n.hasClass(Je)
              ? (n.closest($e.DROPDOWN).find($e.DROPDOWN_TOGGLE).addClass(Ze),
                n.addClass(Ze))
              : (n.addClass(Ze),
                n
                  .parents($e.NAV_LIST_GROUP)
                  .prev($e.NAV_LINKS + ", " + $e.LIST_ITEMS)
                  .addClass(Ze),
                n
                  .parents($e.NAV_LIST_GROUP)
                  .prev($e.NAV_ITEMS)
                  .children($e.NAV_LINKS)
                  .addClass(Ze)),
              Ve(this._scrollElement).trigger(Xe.ACTIVATE, {
                relatedTarget: e,
              });
          }),
          (t._clear = function () {
            Ve(this._selector).filter($e.ACTIVE).removeClass(Ze);
          }),
          (n._jQueryInterface = function (e) {
            return this.each(function () {
              var t = Ve(this).data(Be);
              if (
                (t ||
                  ((t = new n(this, "object" == typeof e && e)),
                  Ve(this).data(Be, t)),
                "string" == typeof e)
              ) {
                if ("undefined" == typeof t[e])
                  throw new TypeError('No method named "' + e + '"');
                t[e]();
              }
            });
          }),
          o(n, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
            {
              key: "Default",
              get: function () {
                return qe;
              },
            },
          ]),
          n
        );
      })()),
      Ve(window).on(Xe.LOAD_DATA_API, function () {
        for (var t = Ve.makeArray(Ve($e.DATA_SPY)), e = t.length; e--; ) {
          var n = Ve(t[e]);
          nn._jQueryInterface.call(n, n.data());
        }
      }),
      (Ve.fn[Qe] = nn._jQueryInterface),
      (Ve.fn[Qe].Constructor = nn),
      (Ve.fn[Qe].noConflict = function () {
        return (Ve.fn[Qe] = Ge), nn._jQueryInterface;
      }),
      nn),
    Pn =
      ((on = "." + (sn = "bs.tab")),
      (an = (rn = e).fn.tab),
      (ln = {
        HIDE: "hide" + on,
        HIDDEN: "hidden" + on,
        SHOW: "show" + on,
        SHOWN: "shown" + on,
        CLICK_DATA_API: "click" + on + ".data-api",
      }),
      (hn = "dropdown-menu"),
      (cn = "active"),
      (un = "disabled"),
      (fn = "fade"),
      (dn = "show"),
      (_n = ".dropdown"),
      (gn = ".nav, .list-group"),
      (mn = ".active"),
      (pn = "> li > .active"),
      (vn = '[data-toggle="tab"], [data-toggle="pill"], [data-toggle="list"]'),
      (En = ".dropdown-toggle"),
      (yn = "> .dropdown-menu .active"),
      (Tn = (function () {
        function i(t) {
          this._element = t;
        }
        var t = i.prototype;
        return (
          (t.show = function () {
            var n = this;
            if (
              !(
                (this._element.parentNode &&
                  this._element.parentNode.nodeType === Node.ELEMENT_NODE &&
                  rn(this._element).hasClass(cn)) ||
                rn(this._element).hasClass(un)
              )
            ) {
              var t,
                i,
                e = rn(this._element).closest(gn)[0],
                r = Cn.getSelectorFromElement(this._element);
              if (e) {
                var s = "UL" === e.nodeName ? pn : mn;
                i = (i = rn.makeArray(rn(e).find(s)))[i.length - 1];
              }
              var o = rn.Event(ln.HIDE, { relatedTarget: this._element }),
                a = rn.Event(ln.SHOW, { relatedTarget: i });
              if (
                (i && rn(i).trigger(o),
                rn(this._element).trigger(a),
                !a.isDefaultPrevented() && !o.isDefaultPrevented())
              ) {
                r && (t = rn(r)[0]), this._activate(this._element, e);
                var l = function () {
                  var t = rn.Event(ln.HIDDEN, { relatedTarget: n._element }),
                    e = rn.Event(ln.SHOWN, { relatedTarget: i });
                  rn(i).trigger(t), rn(n._element).trigger(e);
                };
                t ? this._activate(t, t.parentNode, l) : l();
              }
            }
          }),
          (t.dispose = function () {
            rn.removeData(this._element, sn), (this._element = null);
          }),
          (t._activate = function (t, e, n) {
            var i = this,
              r = (
                "UL" === e.nodeName ? rn(e).find(pn) : rn(e).children(mn)
              )[0],
              s = n && r && rn(r).hasClass(fn),
              o = function () {
                return i._transitionComplete(t, r, n);
              };
            if (r && s) {
              var a = Cn.getTransitionDurationFromElement(r);
              rn(r).one(Cn.TRANSITION_END, o).emulateTransitionEnd(a);
            } else o();
          }),
          (t._transitionComplete = function (t, e, n) {
            if (e) {
              rn(e).removeClass(dn + " " + cn);
              var i = rn(e.parentNode).find(yn)[0];
              i && rn(i).removeClass(cn),
                "tab" === e.getAttribute("role") &&
                  e.setAttribute("aria-selected", !1);
            }
            if (
              (rn(t).addClass(cn),
              "tab" === t.getAttribute("role") &&
                t.setAttribute("aria-selected", !0),
              Cn.reflow(t),
              rn(t).addClass(dn),
              t.parentNode && rn(t.parentNode).hasClass(hn))
            ) {
              var r = rn(t).closest(_n)[0];
              r && rn(r).find(En).addClass(cn),
                t.setAttribute("aria-expanded", !0);
            }
            n && n();
          }),
          (i._jQueryInterface = function (n) {
            return this.each(function () {
              var t = rn(this),
                e = t.data(sn);
              if (
                (e || ((e = new i(this)), t.data(sn, e)), "string" == typeof n)
              ) {
                if ("undefined" == typeof e[n])
                  throw new TypeError('No method named "' + n + '"');
                e[n]();
              }
            });
          }),
          o(i, null, [
            {
              key: "VERSION",
              get: function () {
                return "4.1.1";
              },
            },
          ]),
          i
        );
      })()),
      rn(document).on(ln.CLICK_DATA_API, vn, function (t) {
        t.preventDefault(), Tn._jQueryInterface.call(rn(this), "show");
      }),
      (rn.fn.tab = Tn._jQueryInterface),
      (rn.fn.tab.Constructor = Tn),
      (rn.fn.tab.noConflict = function () {
        return (rn.fn.tab = an), Tn._jQueryInterface;
      }),
      Tn);
  !(function (t) {
    if ("undefined" == typeof t)
      throw new TypeError(
        "Bootstrap's JavaScript requires jQuery. jQuery must be included before Bootstrap's JavaScript."
      );
    var e = t.fn.jquery.split(" ")[0].split(".");
    if (
      (e[0] < 2 && e[1] < 9) ||
      (1 === e[0] && 9 === e[1] && e[2] < 1) ||
      4 <= e[0]
    )
      throw new Error(
        "Bootstrap's JavaScript requires at least jQuery v1.9.1 but less than v4.0.0"
      );
  })(e),
    (t.Util = Cn),
    (t.Alert = In),
    (t.Button = An),
    (t.Carousel = Dn),
    (t.Collapse = bn),
    (t.Dropdown = Sn),
    (t.Modal = wn),
    (t.Popover = On),
    (t.Scrollspy = kn),
    (t.Tab = Pn),
    (t.Tooltip = Nn),
    Object.defineProperty(t, "__esModule", { value: !0 });
});

/**
 * Swiper 4.3.5
 * Most modern mobile touch slider and framework with hardware accelerated transitions
 * http://www.idangero.us/swiper/
 *
 * Copyright 2014-2018 Vladimir Kharlampidi
 *
 * Released under the MIT License
 *
 * Released on: July 31, 2018
 */
!(function (e, t) {
  "object" == typeof exports && "undefined" != typeof module
    ? (module.exports = t())
    : "function" == typeof define && define.amd
      ? define(t)
      : (e.Swiper = t());
})(this, function () {
  "use strict";
  var f =
      "undefined" == typeof document
        ? {
            body: {},
            addEventListener: function () {},
            removeEventListener: function () {},
            activeElement: { blur: function () {}, nodeName: "" },
            querySelector: function () {
              return null;
            },
            querySelectorAll: function () {
              return [];
            },
            getElementById: function () {
              return null;
            },
            createEvent: function () {
              return { initEvent: function () {} };
            },
            createElement: function () {
              return {
                children: [],
                childNodes: [],
                style: {},
                setAttribute: function () {},
                getElementsByTagName: function () {
                  return [];
                },
              };
            },
            location: { hash: "" },
          }
        : document,
    B =
      "undefined" == typeof window
        ? {
            document: f,
            navigator: { userAgent: "" },
            location: {},
            history: {},
            CustomEvent: function () {
              return this;
            },
            addEventListener: function () {},
            removeEventListener: function () {},
            getComputedStyle: function () {
              return {
                getPropertyValue: function () {
                  return "";
                },
              };
            },
            Image: function () {},
            Date: function () {},
            screen: {},
            setTimeout: function () {},
            clearTimeout: function () {},
          }
        : window,
    l = function (e) {
      for (var t = 0; t < e.length; t += 1) this[t] = e[t];
      return (this.length = e.length), this;
    };
  function L(e, t) {
    var a = [],
      i = 0;
    if (e && !t && e instanceof l) return e;
    if (e)
      if ("string" == typeof e) {
        var s,
          r,
          n = e.trim();
        if (0 <= n.indexOf("<") && 0 <= n.indexOf(">")) {
          var o = "div";
          for (
            0 === n.indexOf("<li") && (o = "ul"),
              0 === n.indexOf("<tr") && (o = "tbody"),
              (0 !== n.indexOf("<td") && 0 !== n.indexOf("<th")) || (o = "tr"),
              0 === n.indexOf("<tbody") && (o = "table"),
              0 === n.indexOf("<option") && (o = "select"),
              (r = f.createElement(o)).innerHTML = n,
              i = 0;
            i < r.childNodes.length;
            i += 1
          )
            a.push(r.childNodes[i]);
        } else
          for (
            s =
              t || "#" !== e[0] || e.match(/[ .<>:~]/)
                ? (t || f).querySelectorAll(e.trim())
                : [f.getElementById(e.trim().split("#")[1])],
              i = 0;
            i < s.length;
            i += 1
          )
            s[i] && a.push(s[i]);
      } else if (e.nodeType || e === B || e === f) a.push(e);
      else if (0 < e.length && e[0].nodeType)
        for (i = 0; i < e.length; i += 1) a.push(e[i]);
    return new l(a);
  }
  function r(e) {
    for (var t = [], a = 0; a < e.length; a += 1)
      -1 === t.indexOf(e[a]) && t.push(e[a]);
    return t;
  }
  (L.fn = l.prototype), (L.Class = l), (L.Dom7 = l);
  var t = {
    addClass: function (e) {
      if (void 0 === e) return this;
      for (var t = e.split(" "), a = 0; a < t.length; a += 1)
        for (var i = 0; i < this.length; i += 1)
          void 0 !== this[i] &&
            void 0 !== this[i].classList &&
            this[i].classList.add(t[a]);
      return this;
    },
    removeClass: function (e) {
      for (var t = e.split(" "), a = 0; a < t.length; a += 1)
        for (var i = 0; i < this.length; i += 1)
          void 0 !== this[i] &&
            void 0 !== this[i].classList &&
            this[i].classList.remove(t[a]);
      return this;
    },
    hasClass: function (e) {
      return !!this[0] && this[0].classList.contains(e);
    },
    toggleClass: function (e) {
      for (var t = e.split(" "), a = 0; a < t.length; a += 1)
        for (var i = 0; i < this.length; i += 1)
          void 0 !== this[i] &&
            void 0 !== this[i].classList &&
            this[i].classList.toggle(t[a]);
      return this;
    },
    attr: function (e, t) {
      var a = arguments;
      if (1 === arguments.length && "string" == typeof e)
        return this[0] ? this[0].getAttribute(e) : void 0;
      for (var i = 0; i < this.length; i += 1)
        if (2 === a.length) this[i].setAttribute(e, t);
        else
          for (var s in e) (this[i][s] = e[s]), this[i].setAttribute(s, e[s]);
      return this;
    },
    removeAttr: function (e) {
      for (var t = 0; t < this.length; t += 1) this[t].removeAttribute(e);
      return this;
    },
    data: function (e, t) {
      var a;
      if (void 0 !== t) {
        for (var i = 0; i < this.length; i += 1)
          (a = this[i]).dom7ElementDataStorage ||
            (a.dom7ElementDataStorage = {}),
            (a.dom7ElementDataStorage[e] = t);
        return this;
      }
      if ((a = this[0])) {
        if (a.dom7ElementDataStorage && e in a.dom7ElementDataStorage)
          return a.dom7ElementDataStorage[e];
        var s = a.getAttribute("data-" + e);
        return s || void 0;
      }
    },
    transform: function (e) {
      for (var t = 0; t < this.length; t += 1) {
        var a = this[t].style;
        (a.webkitTransform = e), (a.transform = e);
      }
      return this;
    },
    transition: function (e) {
      "string" != typeof e && (e += "ms");
      for (var t = 0; t < this.length; t += 1) {
        var a = this[t].style;
        (a.webkitTransitionDuration = e), (a.transitionDuration = e);
      }
      return this;
    },
    on: function () {
      for (var e, t = [], a = arguments.length; a--; ) t[a] = arguments[a];
      var i = t[0],
        r = t[1],
        n = t[2],
        s = t[3];
      function o(e) {
        var t = e.target;
        if (t) {
          var a = e.target.dom7EventData || [];
          if ((a.indexOf(e) < 0 && a.unshift(e), L(t).is(r))) n.apply(t, a);
          else
            for (var i = L(t).parents(), s = 0; s < i.length; s += 1)
              L(i[s]).is(r) && n.apply(i[s], a);
        }
      }
      function l(e) {
        var t = (e && e.target && e.target.dom7EventData) || [];
        t.indexOf(e) < 0 && t.unshift(e), n.apply(this, t);
      }
      "function" == typeof t[1] &&
        ((i = (e = t)[0]), (n = e[1]), (s = e[2]), (r = void 0)),
        s || (s = !1);
      for (var d, p = i.split(" "), c = 0; c < this.length; c += 1) {
        var u = this[c];
        if (r)
          for (d = 0; d < p.length; d += 1) {
            var h = p[d];
            u.dom7LiveListeners || (u.dom7LiveListeners = {}),
              u.dom7LiveListeners[h] || (u.dom7LiveListeners[h] = []),
              u.dom7LiveListeners[h].push({ listener: n, proxyListener: o }),
              u.addEventListener(h, o, s);
          }
        else
          for (d = 0; d < p.length; d += 1) {
            var v = p[d];
            u.dom7Listeners || (u.dom7Listeners = {}),
              u.dom7Listeners[v] || (u.dom7Listeners[v] = []),
              u.dom7Listeners[v].push({ listener: n, proxyListener: l }),
              u.addEventListener(v, l, s);
          }
      }
      return this;
    },
    off: function () {
      for (var e, t = [], a = arguments.length; a--; ) t[a] = arguments[a];
      var i = t[0],
        s = t[1],
        r = t[2],
        n = t[3];
      "function" == typeof t[1] &&
        ((i = (e = t)[0]), (r = e[1]), (n = e[2]), (s = void 0)),
        n || (n = !1);
      for (var o = i.split(" "), l = 0; l < o.length; l += 1)
        for (var d = o[l], p = 0; p < this.length; p += 1) {
          var c = this[p],
            u = void 0;
          if (
            (!s && c.dom7Listeners
              ? (u = c.dom7Listeners[d])
              : s && c.dom7LiveListeners && (u = c.dom7LiveListeners[d]),
            u && u.length)
          )
            for (var h = u.length - 1; 0 <= h; h -= 1) {
              var v = u[h];
              r && v.listener === r
                ? (c.removeEventListener(d, v.proxyListener, n), u.splice(h, 1))
                : r ||
                  (c.removeEventListener(d, v.proxyListener, n),
                  u.splice(h, 1));
            }
        }
      return this;
    },
    trigger: function () {
      for (var e = [], t = arguments.length; t--; ) e[t] = arguments[t];
      for (var a = e[0].split(" "), i = e[1], s = 0; s < a.length; s += 1)
        for (var r = a[s], n = 0; n < this.length; n += 1) {
          var o = this[n],
            l = void 0;
          try {
            l = new B.CustomEvent(r, {
              detail: i,
              bubbles: !0,
              cancelable: !0,
            });
          } catch (e) {
            (l = f.createEvent("Event")).initEvent(r, !0, !0), (l.detail = i);
          }
          (o.dom7EventData = e.filter(function (e, t) {
            return 0 < t;
          })),
            o.dispatchEvent(l),
            (o.dom7EventData = []),
            delete o.dom7EventData;
        }
      return this;
    },
    transitionEnd: function (t) {
      var a,
        i = ["webkitTransitionEnd", "transitionend"],
        s = this;
      function r(e) {
        if (e.target === this)
          for (t.call(this, e), a = 0; a < i.length; a += 1) s.off(i[a], r);
      }
      if (t) for (a = 0; a < i.length; a += 1) s.on(i[a], r);
      return this;
    },
    outerWidth: function (e) {
      if (0 < this.length) {
        if (e) {
          var t = this.styles();
          return (
            this[0].offsetWidth +
            parseFloat(t.getPropertyValue("margin-right")) +
            parseFloat(t.getPropertyValue("margin-left"))
          );
        }
        return this[0].offsetWidth;
      }
      return null;
    },
    outerHeight: function (e) {
      if (0 < this.length) {
        if (e) {
          var t = this.styles();
          return (
            this[0].offsetHeight +
            parseFloat(t.getPropertyValue("margin-top")) +
            parseFloat(t.getPropertyValue("margin-bottom"))
          );
        }
        return this[0].offsetHeight;
      }
      return null;
    },
    offset: function () {
      if (0 < this.length) {
        var e = this[0],
          t = e.getBoundingClientRect(),
          a = f.body,
          i = e.clientTop || a.clientTop || 0,
          s = e.clientLeft || a.clientLeft || 0,
          r = e === B ? B.scrollY : e.scrollTop,
          n = e === B ? B.scrollX : e.scrollLeft;
        return { top: t.top + r - i, left: t.left + n - s };
      }
      return null;
    },
    css: function (e, t) {
      var a;
      if (1 === arguments.length) {
        if ("string" != typeof e) {
          for (a = 0; a < this.length; a += 1)
            for (var i in e) this[a].style[i] = e[i];
          return this;
        }
        if (this[0])
          return B.getComputedStyle(this[0], null).getPropertyValue(e);
      }
      if (2 === arguments.length && "string" == typeof e) {
        for (a = 0; a < this.length; a += 1) this[a].style[e] = t;
        return this;
      }
      return this;
    },
    each: function (e) {
      if (!e) return this;
      for (var t = 0; t < this.length; t += 1)
        if (!1 === e.call(this[t], t, this[t])) return this;
      return this;
    },
    html: function (e) {
      if (void 0 === e) return this[0] ? this[0].innerHTML : void 0;
      for (var t = 0; t < this.length; t += 1) this[t].innerHTML = e;
      return this;
    },
    text: function (e) {
      if (void 0 === e) return this[0] ? this[0].textContent.trim() : null;
      for (var t = 0; t < this.length; t += 1) this[t].textContent = e;
      return this;
    },
    is: function (e) {
      var t,
        a,
        i = this[0];
      if (!i || void 0 === e) return !1;
      if ("string" == typeof e) {
        if (i.matches) return i.matches(e);
        if (i.webkitMatchesSelector) return i.webkitMatchesSelector(e);
        if (i.msMatchesSelector) return i.msMatchesSelector(e);
        for (t = L(e), a = 0; a < t.length; a += 1) if (t[a] === i) return !0;
        return !1;
      }
      if (e === f) return i === f;
      if (e === B) return i === B;
      if (e.nodeType || e instanceof l) {
        for (t = e.nodeType ? [e] : e, a = 0; a < t.length; a += 1)
          if (t[a] === i) return !0;
        return !1;
      }
      return !1;
    },
    index: function () {
      var e,
        t = this[0];
      if (t) {
        for (e = 0; null !== (t = t.previousSibling); )
          1 === t.nodeType && (e += 1);
        return e;
      }
    },
    eq: function (e) {
      if (void 0 === e) return this;
      var t,
        a = this.length;
      return new l(
        a - 1 < e ? [] : e < 0 ? ((t = a + e) < 0 ? [] : [this[t]]) : [this[e]]
      );
    },
    append: function () {
      for (var e, t = [], a = arguments.length; a--; ) t[a] = arguments[a];
      for (var i = 0; i < t.length; i += 1) {
        e = t[i];
        for (var s = 0; s < this.length; s += 1)
          if ("string" == typeof e) {
            var r = f.createElement("div");
            for (r.innerHTML = e; r.firstChild; )
              this[s].appendChild(r.firstChild);
          } else if (e instanceof l)
            for (var n = 0; n < e.length; n += 1) this[s].appendChild(e[n]);
          else this[s].appendChild(e);
      }
      return this;
    },
    prepend: function (e) {
      var t,
        a,
        i = this;
      for (t = 0; t < this.length; t += 1)
        if ("string" == typeof e) {
          var s = f.createElement("div");
          for (s.innerHTML = e, a = s.childNodes.length - 1; 0 <= a; a -= 1)
            i[t].insertBefore(s.childNodes[a], i[t].childNodes[0]);
        } else if (e instanceof l)
          for (a = 0; a < e.length; a += 1)
            i[t].insertBefore(e[a], i[t].childNodes[0]);
        else i[t].insertBefore(e, i[t].childNodes[0]);
      return this;
    },
    next: function (e) {
      return 0 < this.length
        ? e
          ? this[0].nextElementSibling && L(this[0].nextElementSibling).is(e)
            ? new l([this[0].nextElementSibling])
            : new l([])
          : this[0].nextElementSibling
            ? new l([this[0].nextElementSibling])
            : new l([])
        : new l([]);
    },
    nextAll: function (e) {
      var t = [],
        a = this[0];
      if (!a) return new l([]);
      for (; a.nextElementSibling; ) {
        var i = a.nextElementSibling;
        e ? L(i).is(e) && t.push(i) : t.push(i), (a = i);
      }
      return new l(t);
    },
    prev: function (e) {
      if (0 < this.length) {
        var t = this[0];
        return e
          ? t.previousElementSibling && L(t.previousElementSibling).is(e)
            ? new l([t.previousElementSibling])
            : new l([])
          : t.previousElementSibling
            ? new l([t.previousElementSibling])
            : new l([]);
      }
      return new l([]);
    },
    prevAll: function (e) {
      var t = [],
        a = this[0];
      if (!a) return new l([]);
      for (; a.previousElementSibling; ) {
        var i = a.previousElementSibling;
        e ? L(i).is(e) && t.push(i) : t.push(i), (a = i);
      }
      return new l(t);
    },
    parent: function (e) {
      for (var t = [], a = 0; a < this.length; a += 1)
        null !== this[a].parentNode &&
          (e
            ? L(this[a].parentNode).is(e) && t.push(this[a].parentNode)
            : t.push(this[a].parentNode));
      return L(r(t));
    },
    parents: function (e) {
      for (var t = [], a = 0; a < this.length; a += 1)
        for (var i = this[a].parentNode; i; )
          e ? L(i).is(e) && t.push(i) : t.push(i), (i = i.parentNode);
      return L(r(t));
    },
    closest: function (e) {
      var t = this;
      return void 0 === e
        ? new l([])
        : (t.is(e) || (t = t.parents(e).eq(0)), t);
    },
    find: function (e) {
      for (var t = [], a = 0; a < this.length; a += 1)
        for (var i = this[a].querySelectorAll(e), s = 0; s < i.length; s += 1)
          t.push(i[s]);
      return new l(t);
    },
    children: function (e) {
      for (var t = [], a = 0; a < this.length; a += 1)
        for (var i = this[a].childNodes, s = 0; s < i.length; s += 1)
          e
            ? 1 === i[s].nodeType && L(i[s]).is(e) && t.push(i[s])
            : 1 === i[s].nodeType && t.push(i[s]);
      return new l(r(t));
    },
    remove: function () {
      for (var e = 0; e < this.length; e += 1)
        this[e].parentNode && this[e].parentNode.removeChild(this[e]);
      return this;
    },
    add: function () {
      for (var e = [], t = arguments.length; t--; ) e[t] = arguments[t];
      var a, i;
      for (a = 0; a < e.length; a += 1) {
        var s = L(e[a]);
        for (i = 0; i < s.length; i += 1)
          (this[this.length] = s[i]), (this.length += 1);
      }
      return this;
    },
    styles: function () {
      return this[0] ? B.getComputedStyle(this[0], null) : {};
    },
  };
  Object.keys(t).forEach(function (e) {
    L.fn[e] = t[e];
  });
  var e,
    a,
    i,
    X = {
      deleteProps: function (e) {
        var t = e;
        Object.keys(t).forEach(function (e) {
          try {
            t[e] = null;
          } catch (e) {}
          try {
            delete t[e];
          } catch (e) {}
        });
      },
      nextTick: function (e, t) {
        return void 0 === t && (t = 0), setTimeout(e, t);
      },
      now: function () {
        return Date.now();
      },
      getTranslate: function (e, t) {
        var a, i, s;
        void 0 === t && (t = "x");
        var r = B.getComputedStyle(e, null);
        return (
          B.WebKitCSSMatrix
            ? (6 < (i = r.transform || r.webkitTransform).split(",").length &&
                (i = i
                  .split(", ")
                  .map(function (e) {
                    return e.replace(",", ".");
                  })
                  .join(", ")),
              (s = new B.WebKitCSSMatrix("none" === i ? "" : i)))
            : (a = (s =
                r.MozTransform ||
                r.OTransform ||
                r.MsTransform ||
                r.msTransform ||
                r.transform ||
                r
                  .getPropertyValue("transform")
                  .replace("translate(", "matrix(1, 0, 0, 1,"))
                .toString()
                .split(",")),
          "x" === t &&
            (i = B.WebKitCSSMatrix
              ? s.m41
              : 16 === a.length
                ? parseFloat(a[12])
                : parseFloat(a[4])),
          "y" === t &&
            (i = B.WebKitCSSMatrix
              ? s.m42
              : 16 === a.length
                ? parseFloat(a[13])
                : parseFloat(a[5])),
          i || 0
        );
      },
      parseUrlQuery: function (e) {
        var t,
          a,
          i,
          s,
          r = {},
          n = e || B.location.href;
        if ("string" == typeof n && n.length)
          for (
            s = (a = (n = -1 < n.indexOf("?") ? n.replace(/\S*\?/, "") : "")
              .split("&")
              .filter(function (e) {
                return "" !== e;
              })).length,
              t = 0;
            t < s;
            t += 1
          )
            (i = a[t].replace(/#\S+/g, "").split("=")),
              (r[decodeURIComponent(i[0])] =
                void 0 === i[1] ? void 0 : decodeURIComponent(i[1]) || "");
        return r;
      },
      isObject: function (e) {
        return (
          "object" == typeof e &&
          null !== e &&
          e.constructor &&
          e.constructor === Object
        );
      },
      extend: function () {
        for (var e = [], t = arguments.length; t--; ) e[t] = arguments[t];
        for (var a = Object(e[0]), i = 1; i < e.length; i += 1) {
          var s = e[i];
          if (null != s)
            for (
              var r = Object.keys(Object(s)), n = 0, o = r.length;
              n < o;
              n += 1
            ) {
              var l = r[n],
                d = Object.getOwnPropertyDescriptor(s, l);
              void 0 !== d &&
                d.enumerable &&
                (X.isObject(a[l]) && X.isObject(s[l])
                  ? X.extend(a[l], s[l])
                  : !X.isObject(a[l]) && X.isObject(s[l])
                    ? ((a[l] = {}), X.extend(a[l], s[l]))
                    : (a[l] = s[l]));
            }
        }
        return a;
      },
    },
    Y =
      ((i = f.createElement("div")),
      {
        touch:
          (B.Modernizr && !0 === B.Modernizr.touch) ||
          !!(
            "ontouchstart" in B ||
            (B.DocumentTouch && f instanceof B.DocumentTouch)
          ),
        pointerEvents: !(!B.navigator.pointerEnabled && !B.PointerEvent),
        prefixedPointerEvents: !!B.navigator.msPointerEnabled,
        transition:
          ((a = i.style),
          "transition" in a || "webkitTransition" in a || "MozTransition" in a),
        transforms3d:
          (B.Modernizr && !0 === B.Modernizr.csstransforms3d) ||
          ((e = i.style),
          "webkitPerspective" in e ||
            "MozPerspective" in e ||
            "OPerspective" in e ||
            "MsPerspective" in e ||
            "perspective" in e),
        flexbox: (function () {
          for (
            var e = i.style,
              t =
                "alignItems webkitAlignItems webkitBoxAlign msFlexAlign mozBoxAlign webkitFlexDirection msFlexDirection mozBoxDirection mozBoxOrient webkitBoxDirection webkitBoxOrient".split(
                  " "
                ),
              a = 0;
            a < t.length;
            a += 1
          )
            if (t[a] in e) return !0;
          return !1;
        })(),
        observer: "MutationObserver" in B || "WebkitMutationObserver" in B,
        passiveListener: (function () {
          var e = !1;
          try {
            var t = Object.defineProperty({}, "passive", {
              get: function () {
                e = !0;
              },
            });
            B.addEventListener("testPassiveListener", null, t);
          } catch (e) {}
          return e;
        })(),
        gestures: "ongesturestart" in B,
      }),
    s = function (e) {
      void 0 === e && (e = {});
      var t = this;
      (t.params = e),
        (t.eventsListeners = {}),
        t.params &&
          t.params.on &&
          Object.keys(t.params.on).forEach(function (e) {
            t.on(e, t.params.on[e]);
          });
    },
    n = { components: { configurable: !0 } };
  (s.prototype.on = function (e, t, a) {
    var i = this;
    if ("function" != typeof t) return i;
    var s = a ? "unshift" : "push";
    return (
      e.split(" ").forEach(function (e) {
        i.eventsListeners[e] || (i.eventsListeners[e] = []),
          i.eventsListeners[e][s](t);
      }),
      i
    );
  }),
    (s.prototype.once = function (i, s, e) {
      var r = this;
      if ("function" != typeof s) return r;
      return r.on(
        i,
        function e() {
          for (var t = [], a = arguments.length; a--; ) t[a] = arguments[a];
          s.apply(r, t), r.off(i, e);
        },
        e
      );
    }),
    (s.prototype.off = function (e, i) {
      var s = this;
      return (
        s.eventsListeners &&
          e.split(" ").forEach(function (a) {
            void 0 === i
              ? (s.eventsListeners[a] = [])
              : s.eventsListeners[a].forEach(function (e, t) {
                  e === i && s.eventsListeners[a].splice(t, 1);
                });
          }),
        s
      );
    }),
    (s.prototype.emit = function () {
      for (var e = [], t = arguments.length; t--; ) e[t] = arguments[t];
      var a,
        i,
        s,
        r = this;
      return (
        r.eventsListeners &&
          ("string" == typeof e[0] || Array.isArray(e[0])
            ? ((a = e[0]), (i = e.slice(1, e.length)), (s = r))
            : ((a = e[0].events), (i = e[0].data), (s = e[0].context || r)),
          (Array.isArray(a) ? a : a.split(" ")).forEach(function (e) {
            if (r.eventsListeners && r.eventsListeners[e]) {
              var t = [];
              r.eventsListeners[e].forEach(function (e) {
                t.push(e);
              }),
                t.forEach(function (e) {
                  e.apply(s, i);
                });
            }
          })),
        r
      );
    }),
    (s.prototype.useModulesParams = function (a) {
      var i = this;
      i.modules &&
        Object.keys(i.modules).forEach(function (e) {
          var t = i.modules[e];
          t.params && X.extend(a, t.params);
        });
    }),
    (s.prototype.useModules = function (i) {
      void 0 === i && (i = {});
      var s = this;
      s.modules &&
        Object.keys(s.modules).forEach(function (e) {
          var a = s.modules[e],
            t = i[e] || {};
          a.instance &&
            Object.keys(a.instance).forEach(function (e) {
              var t = a.instance[e];
              s[e] = "function" == typeof t ? t.bind(s) : t;
            }),
            a.on &&
              s.on &&
              Object.keys(a.on).forEach(function (e) {
                s.on(e, a.on[e]);
              }),
            a.create && a.create.bind(s)(t);
        });
    }),
    (n.components.set = function (e) {
      this.use && this.use(e);
    }),
    (s.installModule = function (t) {
      for (var e = [], a = arguments.length - 1; 0 < a--; )
        e[a] = arguments[a + 1];
      var i = this;
      i.prototype.modules || (i.prototype.modules = {});
      var s = t.name || Object.keys(i.prototype.modules).length + "_" + X.now();
      return (
        (i.prototype.modules[s] = t).proto &&
          Object.keys(t.proto).forEach(function (e) {
            i.prototype[e] = t.proto[e];
          }),
        t.static &&
          Object.keys(t.static).forEach(function (e) {
            i[e] = t.static[e];
          }),
        t.install && t.install.apply(i, e),
        i
      );
    }),
    (s.use = function (e) {
      for (var t = [], a = arguments.length - 1; 0 < a--; )
        t[a] = arguments[a + 1];
      var i = this;
      return Array.isArray(e)
        ? (e.forEach(function (e) {
            return i.installModule(e);
          }),
          i)
        : i.installModule.apply(i, [e].concat(t));
    }),
    Object.defineProperties(s, n);
  var o = {
    updateSize: function () {
      var e,
        t,
        a = this,
        i = a.$el;
      (e = void 0 !== a.params.width ? a.params.width : i[0].clientWidth),
        (t = void 0 !== a.params.height ? a.params.height : i[0].clientHeight),
        (0 === e && a.isHorizontal()) ||
          (0 === t && a.isVertical()) ||
          ((e =
            e -
            parseInt(i.css("padding-left"), 10) -
            parseInt(i.css("padding-right"), 10)),
          (t =
            t -
            parseInt(i.css("padding-top"), 10) -
            parseInt(i.css("padding-bottom"), 10)),
          X.extend(a, { width: e, height: t, size: a.isHorizontal() ? e : t }));
    },
    updateSlides: function () {
      var e = this,
        t = e.params,
        a = e.$wrapperEl,
        i = e.size,
        s = e.rtlTranslate,
        r = e.wrongRTL,
        n = e.virtual && t.virtual.enabled,
        o = n ? e.virtual.slides.length : e.slides.length,
        l = a.children("." + e.params.slideClass),
        d = n ? e.virtual.slides.length : l.length,
        p = [],
        c = [],
        u = [],
        h = t.slidesOffsetBefore;
      "function" == typeof h && (h = t.slidesOffsetBefore.call(e));
      var v = t.slidesOffsetAfter;
      "function" == typeof v && (v = t.slidesOffsetAfter.call(e));
      var f = e.snapGrid.length,
        m = e.snapGrid.length,
        g = t.spaceBetween,
        b = -h,
        w = 0,
        y = 0;
      if (void 0 !== i) {
        var x, E;
        "string" == typeof g &&
          0 <= g.indexOf("%") &&
          (g = (parseFloat(g.replace("%", "")) / 100) * i),
          (e.virtualSize = -g),
          s
            ? l.css({ marginLeft: "", marginTop: "" })
            : l.css({ marginRight: "", marginBottom: "" }),
          1 < t.slidesPerColumn &&
            ((x =
              Math.floor(d / t.slidesPerColumn) === d / e.params.slidesPerColumn
                ? d
                : Math.ceil(d / t.slidesPerColumn) * t.slidesPerColumn),
            "auto" !== t.slidesPerView &&
              "row" === t.slidesPerColumnFill &&
              (x = Math.max(x, t.slidesPerView * t.slidesPerColumn)));
        for (
          var T,
            S = t.slidesPerColumn,
            C = x / S,
            M = C - (t.slidesPerColumn * C - d),
            z = 0;
          z < d;
          z += 1
        ) {
          E = 0;
          var k = l.eq(z);
          if (1 < t.slidesPerColumn) {
            var P = void 0,
              $ = void 0,
              L = void 0;
            "column" === t.slidesPerColumnFill
              ? ((L = z - ($ = Math.floor(z / S)) * S),
                (M < $ || ($ === M && L === S - 1)) &&
                  S <= (L += 1) &&
                  ((L = 0), ($ += 1)),
                (P = $ + (L * x) / S),
                k.css({
                  "-webkit-box-ordinal-group": P,
                  "-moz-box-ordinal-group": P,
                  "-ms-flex-order": P,
                  "-webkit-order": P,
                  order: P,
                }))
              : ($ = z - (L = Math.floor(z / C)) * C),
              k
                .css(
                  "margin-" + (e.isHorizontal() ? "top" : "left"),
                  0 !== L && t.spaceBetween && t.spaceBetween + "px"
                )
                .attr("data-swiper-column", $)
                .attr("data-swiper-row", L);
          }
          if ("none" !== k.css("display")) {
            if ("auto" === t.slidesPerView) {
              var I = B.getComputedStyle(k[0], null),
                D = k[0].style.transform,
                O = k[0].style.webkitTransform;
              D && (k[0].style.transform = "none"),
                O && (k[0].style.webkitTransform = "none"),
                (E = e.isHorizontal()
                  ? k[0].getBoundingClientRect().width +
                    parseFloat(I.getPropertyValue("margin-left")) +
                    parseFloat(I.getPropertyValue("margin-right"))
                  : k[0].getBoundingClientRect().height +
                    parseFloat(I.getPropertyValue("margin-top")) +
                    parseFloat(I.getPropertyValue("margin-bottom"))),
                D && (k[0].style.transform = D),
                O && (k[0].style.webkitTransform = O),
                t.roundLengths && (E = Math.floor(E));
            } else
              (E = (i - (t.slidesPerView - 1) * g) / t.slidesPerView),
                t.roundLengths && (E = Math.floor(E)),
                l[z] &&
                  (e.isHorizontal()
                    ? (l[z].style.width = E + "px")
                    : (l[z].style.height = E + "px"));
            l[z] && (l[z].swiperSlideSize = E),
              u.push(E),
              t.centeredSlides
                ? ((b = b + E / 2 + w / 2 + g),
                  0 === w && 0 !== z && (b = b - i / 2 - g),
                  0 === z && (b = b - i / 2 - g),
                  Math.abs(b) < 0.001 && (b = 0),
                  t.roundLengths && (b = Math.floor(b)),
                  y % t.slidesPerGroup == 0 && p.push(b),
                  c.push(b))
                : (t.roundLengths && (b = Math.floor(b)),
                  y % t.slidesPerGroup == 0 && p.push(b),
                  c.push(b),
                  (b = b + E + g)),
              (e.virtualSize += E + g),
              (w = E),
              (y += 1);
          }
        }
        if (
          ((e.virtualSize = Math.max(e.virtualSize, i) + v),
          s &&
            r &&
            ("slide" === t.effect || "coverflow" === t.effect) &&
            a.css({ width: e.virtualSize + t.spaceBetween + "px" }),
          (Y.flexbox && !t.setWrapperSize) ||
            (e.isHorizontal()
              ? a.css({ width: e.virtualSize + t.spaceBetween + "px" })
              : a.css({ height: e.virtualSize + t.spaceBetween + "px" })),
          1 < t.slidesPerColumn &&
            ((e.virtualSize = (E + t.spaceBetween) * x),
            (e.virtualSize =
              Math.ceil(e.virtualSize / t.slidesPerColumn) - t.spaceBetween),
            e.isHorizontal()
              ? a.css({ width: e.virtualSize + t.spaceBetween + "px" })
              : a.css({ height: e.virtualSize + t.spaceBetween + "px" }),
            t.centeredSlides))
        ) {
          T = [];
          for (var A = 0; A < p.length; A += 1) {
            var H = p[A];
            t.roundLengths && (H = Math.floor(H)),
              p[A] < e.virtualSize + p[0] && T.push(H);
          }
          p = T;
        }
        if (!t.centeredSlides) {
          T = [];
          for (var G = 0; G < p.length; G += 1) {
            var N = p[G];
            t.roundLengths && (N = Math.floor(N)),
              p[G] <= e.virtualSize - i && T.push(N);
          }
          (p = T),
            1 < Math.floor(e.virtualSize - i) - Math.floor(p[p.length - 1]) &&
              p.push(e.virtualSize - i);
        }
        0 === p.length && (p = [0]),
          0 !== t.spaceBetween &&
            (e.isHorizontal()
              ? s
                ? l.css({ marginLeft: g + "px" })
                : l.css({ marginRight: g + "px" })
              : l.css({ marginBottom: g + "px" })),
          X.extend(e, {
            slides: l,
            snapGrid: p,
            slidesGrid: c,
            slidesSizesGrid: u,
          }),
          d !== o && e.emit("slidesLengthChange"),
          p.length !== f &&
            (e.params.watchOverflow && e.checkOverflow(),
            e.emit("snapGridLengthChange")),
          c.length !== m && e.emit("slidesGridLengthChange"),
          (t.watchSlidesProgress || t.watchSlidesVisibility) &&
            e.updateSlidesOffset();
      }
    },
    updateAutoHeight: function (e) {
      var t,
        a = this,
        i = [],
        s = 0;
      if (
        ("number" == typeof e
          ? a.setTransition(e)
          : !0 === e && a.setTransition(a.params.speed),
        "auto" !== a.params.slidesPerView && 1 < a.params.slidesPerView)
      )
        for (t = 0; t < Math.ceil(a.params.slidesPerView); t += 1) {
          var r = a.activeIndex + t;
          if (r > a.slides.length) break;
          i.push(a.slides.eq(r)[0]);
        }
      else i.push(a.slides.eq(a.activeIndex)[0]);
      for (t = 0; t < i.length; t += 1)
        if (void 0 !== i[t]) {
          var n = i[t].offsetHeight;
          s = s < n ? n : s;
        }
      s && a.$wrapperEl.css("height", s + "px");
    },
    updateSlidesOffset: function () {
      for (var e = this.slides, t = 0; t < e.length; t += 1)
        e[t].swiperSlideOffset = this.isHorizontal()
          ? e[t].offsetLeft
          : e[t].offsetTop;
    },
    updateSlidesProgress: function (e) {
      void 0 === e && (e = (this && this.translate) || 0);
      var t = this,
        a = t.params,
        i = t.slides,
        s = t.rtlTranslate;
      if (0 !== i.length) {
        void 0 === i[0].swiperSlideOffset && t.updateSlidesOffset();
        var r = -e;
        s && (r = e), i.removeClass(a.slideVisibleClass);
        for (var n = 0; n < i.length; n += 1) {
          var o = i[n],
            l =
              (r +
                (a.centeredSlides ? t.minTranslate() : 0) -
                o.swiperSlideOffset) /
              (o.swiperSlideSize + a.spaceBetween);
          if (a.watchSlidesVisibility) {
            var d = -(r - o.swiperSlideOffset),
              p = d + t.slidesSizesGrid[n];
            ((0 <= d && d < t.size) ||
              (0 < p && p <= t.size) ||
              (d <= 0 && p >= t.size)) &&
              i.eq(n).addClass(a.slideVisibleClass);
          }
          o.progress = s ? -l : l;
        }
      }
    },
    updateProgress: function (e) {
      void 0 === e && (e = (this && this.translate) || 0);
      var t = this,
        a = t.params,
        i = t.maxTranslate() - t.minTranslate(),
        s = t.progress,
        r = t.isBeginning,
        n = t.isEnd,
        o = r,
        l = n;
      0 === i
        ? (n = r = !(s = 0))
        : ((r = (s = (e - t.minTranslate()) / i) <= 0), (n = 1 <= s)),
        X.extend(t, { progress: s, isBeginning: r, isEnd: n }),
        (a.watchSlidesProgress || a.watchSlidesVisibility) &&
          t.updateSlidesProgress(e),
        r && !o && t.emit("reachBeginning toEdge"),
        n && !l && t.emit("reachEnd toEdge"),
        ((o && !r) || (l && !n)) && t.emit("fromEdge"),
        t.emit("progress", s);
    },
    updateSlidesClasses: function () {
      var e,
        t = this,
        a = t.slides,
        i = t.params,
        s = t.$wrapperEl,
        r = t.activeIndex,
        n = t.realIndex,
        o = t.virtual && i.virtual.enabled;
      a.removeClass(
        i.slideActiveClass +
          " " +
          i.slideNextClass +
          " " +
          i.slidePrevClass +
          " " +
          i.slideDuplicateActiveClass +
          " " +
          i.slideDuplicateNextClass +
          " " +
          i.slideDuplicatePrevClass
      ),
        (e = o
          ? t.$wrapperEl.find(
              "." + i.slideClass + '[data-swiper-slide-index="' + r + '"]'
            )
          : a.eq(r)).addClass(i.slideActiveClass),
        i.loop &&
          (e.hasClass(i.slideDuplicateClass)
            ? s
                .children(
                  "." +
                    i.slideClass +
                    ":not(." +
                    i.slideDuplicateClass +
                    ')[data-swiper-slide-index="' +
                    n +
                    '"]'
                )
                .addClass(i.slideDuplicateActiveClass)
            : s
                .children(
                  "." +
                    i.slideClass +
                    "." +
                    i.slideDuplicateClass +
                    '[data-swiper-slide-index="' +
                    n +
                    '"]'
                )
                .addClass(i.slideDuplicateActiveClass));
      var l = e
        .nextAll("." + i.slideClass)
        .eq(0)
        .addClass(i.slideNextClass);
      i.loop && 0 === l.length && (l = a.eq(0)).addClass(i.slideNextClass);
      var d = e
        .prevAll("." + i.slideClass)
        .eq(0)
        .addClass(i.slidePrevClass);
      i.loop && 0 === d.length && (d = a.eq(-1)).addClass(i.slidePrevClass),
        i.loop &&
          (l.hasClass(i.slideDuplicateClass)
            ? s
                .children(
                  "." +
                    i.slideClass +
                    ":not(." +
                    i.slideDuplicateClass +
                    ')[data-swiper-slide-index="' +
                    l.attr("data-swiper-slide-index") +
                    '"]'
                )
                .addClass(i.slideDuplicateNextClass)
            : s
                .children(
                  "." +
                    i.slideClass +
                    "." +
                    i.slideDuplicateClass +
                    '[data-swiper-slide-index="' +
                    l.attr("data-swiper-slide-index") +
                    '"]'
                )
                .addClass(i.slideDuplicateNextClass),
          d.hasClass(i.slideDuplicateClass)
            ? s
                .children(
                  "." +
                    i.slideClass +
                    ":not(." +
                    i.slideDuplicateClass +
                    ')[data-swiper-slide-index="' +
                    d.attr("data-swiper-slide-index") +
                    '"]'
                )
                .addClass(i.slideDuplicatePrevClass)
            : s
                .children(
                  "." +
                    i.slideClass +
                    "." +
                    i.slideDuplicateClass +
                    '[data-swiper-slide-index="' +
                    d.attr("data-swiper-slide-index") +
                    '"]'
                )
                .addClass(i.slideDuplicatePrevClass));
    },
    updateActiveIndex: function (e) {
      var t,
        a = this,
        i = a.rtlTranslate ? a.translate : -a.translate,
        s = a.slidesGrid,
        r = a.snapGrid,
        n = a.params,
        o = a.activeIndex,
        l = a.realIndex,
        d = a.snapIndex,
        p = e;
      if (void 0 === p) {
        for (var c = 0; c < s.length; c += 1)
          void 0 !== s[c + 1]
            ? i >= s[c] && i < s[c + 1] - (s[c + 1] - s[c]) / 2
              ? (p = c)
              : i >= s[c] && i < s[c + 1] && (p = c + 1)
            : i >= s[c] && (p = c);
        n.normalizeSlideIndex && (p < 0 || void 0 === p) && (p = 0);
      }
      if (
        ((t =
          0 <= r.indexOf(i)
            ? r.indexOf(i)
            : Math.floor(p / n.slidesPerGroup)) >= r.length &&
          (t = r.length - 1),
        p !== o)
      ) {
        var u = parseInt(
          a.slides.eq(p).attr("data-swiper-slide-index") || p,
          10
        );
        X.extend(a, {
          snapIndex: t,
          realIndex: u,
          previousIndex: o,
          activeIndex: p,
        }),
          a.emit("activeIndexChange"),
          a.emit("snapIndexChange"),
          l !== u && a.emit("realIndexChange"),
          a.emit("slideChange");
      } else t !== d && ((a.snapIndex = t), a.emit("snapIndexChange"));
    },
    updateClickedSlide: function (e) {
      var t = this,
        a = t.params,
        i = L(e.target).closest("." + a.slideClass)[0],
        s = !1;
      if (i)
        for (var r = 0; r < t.slides.length; r += 1)
          t.slides[r] === i && (s = !0);
      if (!i || !s)
        return (t.clickedSlide = void 0), void (t.clickedIndex = void 0);
      (t.clickedSlide = i),
        t.virtual && t.params.virtual.enabled
          ? (t.clickedIndex = parseInt(
              L(i).attr("data-swiper-slide-index"),
              10
            ))
          : (t.clickedIndex = L(i).index()),
        a.slideToClickedSlide &&
          void 0 !== t.clickedIndex &&
          t.clickedIndex !== t.activeIndex &&
          t.slideToClickedSlide();
    },
  };
  var d = {
    getTranslate: function (e) {
      void 0 === e && (e = this.isHorizontal() ? "x" : "y");
      var t = this.params,
        a = this.rtlTranslate,
        i = this.translate,
        s = this.$wrapperEl;
      if (t.virtualTranslate) return a ? -i : i;
      var r = X.getTranslate(s[0], e);
      return a && (r = -r), r || 0;
    },
    setTranslate: function (e, t) {
      var a = this,
        i = a.rtlTranslate,
        s = a.params,
        r = a.$wrapperEl,
        n = a.progress,
        o = 0,
        l = 0;
      a.isHorizontal() ? (o = i ? -e : e) : (l = e),
        s.roundLengths && ((o = Math.floor(o)), (l = Math.floor(l))),
        s.virtualTranslate ||
          (Y.transforms3d
            ? r.transform("translate3d(" + o + "px, " + l + "px, 0px)")
            : r.transform("translate(" + o + "px, " + l + "px)")),
        (a.previousTranslate = a.translate),
        (a.translate = a.isHorizontal() ? o : l);
      var d = a.maxTranslate() - a.minTranslate();
      (0 === d ? 0 : (e - a.minTranslate()) / d) !== n && a.updateProgress(e),
        a.emit("setTranslate", a.translate, t);
    },
    minTranslate: function () {
      return -this.snapGrid[0];
    },
    maxTranslate: function () {
      return -this.snapGrid[this.snapGrid.length - 1];
    },
  };
  var p = {
    setTransition: function (e, t) {
      this.$wrapperEl.transition(e), this.emit("setTransition", e, t);
    },
    transitionStart: function (e, t) {
      void 0 === e && (e = !0);
      var a = this,
        i = a.activeIndex,
        s = a.params,
        r = a.previousIndex;
      s.autoHeight && a.updateAutoHeight();
      var n = t;
      if (
        (n || (n = r < i ? "next" : i < r ? "prev" : "reset"),
        a.emit("transitionStart"),
        e && i !== r)
      ) {
        if ("reset" === n) return void a.emit("slideResetTransitionStart");
        a.emit("slideChangeTransitionStart"),
          "next" === n
            ? a.emit("slideNextTransitionStart")
            : a.emit("slidePrevTransitionStart");
      }
    },
    transitionEnd: function (e, t) {
      void 0 === e && (e = !0);
      var a = this,
        i = a.activeIndex,
        s = a.previousIndex;
      (a.animating = !1), a.setTransition(0);
      var r = t;
      if (
        (r || (r = s < i ? "next" : i < s ? "prev" : "reset"),
        a.emit("transitionEnd"),
        e && i !== s)
      ) {
        if ("reset" === r) return void a.emit("slideResetTransitionEnd");
        a.emit("slideChangeTransitionEnd"),
          "next" === r
            ? a.emit("slideNextTransitionEnd")
            : a.emit("slidePrevTransitionEnd");
      }
    },
  };
  var c = {
    slideTo: function (e, t, a, i) {
      void 0 === e && (e = 0),
        void 0 === t && (t = this.params.speed),
        void 0 === a && (a = !0);
      var s = this,
        r = e;
      r < 0 && (r = 0);
      var n = s.params,
        o = s.snapGrid,
        l = s.slidesGrid,
        d = s.previousIndex,
        p = s.activeIndex,
        c = s.rtlTranslate;
      if (s.animating && n.preventInteractionOnTransition) return !1;
      var u = Math.floor(r / n.slidesPerGroup);
      u >= o.length && (u = o.length - 1),
        (p || n.initialSlide || 0) === (d || 0) &&
          a &&
          s.emit("beforeSlideChangeStart");
      var h,
        v = -o[u];
      if ((s.updateProgress(v), n.normalizeSlideIndex))
        for (var f = 0; f < l.length; f += 1)
          -Math.floor(100 * v) >= Math.floor(100 * l[f]) && (r = f);
      if (s.initialized && r !== p) {
        if (!s.allowSlideNext && v < s.translate && v < s.minTranslate())
          return !1;
        if (
          !s.allowSlidePrev &&
          v > s.translate &&
          v > s.maxTranslate() &&
          (p || 0) !== r
        )
          return !1;
      }
      return (
        (h = p < r ? "next" : r < p ? "prev" : "reset"),
        (c && -v === s.translate) || (!c && v === s.translate)
          ? (s.updateActiveIndex(r),
            n.autoHeight && s.updateAutoHeight(),
            s.updateSlidesClasses(),
            "slide" !== n.effect && s.setTranslate(v),
            "reset" !== h && (s.transitionStart(a, h), s.transitionEnd(a, h)),
            !1)
          : (0 !== t && Y.transition
              ? (s.setTransition(t),
                s.setTranslate(v),
                s.updateActiveIndex(r),
                s.updateSlidesClasses(),
                s.emit("beforeTransitionStart", t, i),
                s.transitionStart(a, h),
                s.animating ||
                  ((s.animating = !0),
                  s.onSlideToWrapperTransitionEnd ||
                    (s.onSlideToWrapperTransitionEnd = function (e) {
                      s &&
                        !s.destroyed &&
                        e.target === this &&
                        (s.$wrapperEl[0].removeEventListener(
                          "transitionend",
                          s.onSlideToWrapperTransitionEnd
                        ),
                        s.$wrapperEl[0].removeEventListener(
                          "webkitTransitionEnd",
                          s.onSlideToWrapperTransitionEnd
                        ),
                        (s.onSlideToWrapperTransitionEnd = null),
                        delete s.onSlideToWrapperTransitionEnd,
                        s.transitionEnd(a, h));
                    }),
                  s.$wrapperEl[0].addEventListener(
                    "transitionend",
                    s.onSlideToWrapperTransitionEnd
                  ),
                  s.$wrapperEl[0].addEventListener(
                    "webkitTransitionEnd",
                    s.onSlideToWrapperTransitionEnd
                  )))
              : (s.setTransition(0),
                s.setTranslate(v),
                s.updateActiveIndex(r),
                s.updateSlidesClasses(),
                s.emit("beforeTransitionStart", t, i),
                s.transitionStart(a, h),
                s.transitionEnd(a, h)),
            !0)
      );
    },
    slideToLoop: function (e, t, a, i) {
      void 0 === e && (e = 0),
        void 0 === t && (t = this.params.speed),
        void 0 === a && (a = !0);
      var s = e;
      return (
        this.params.loop && (s += this.loopedSlides), this.slideTo(s, t, a, i)
      );
    },
    slideNext: function (e, t, a) {
      void 0 === e && (e = this.params.speed), void 0 === t && (t = !0);
      var i = this,
        s = i.params,
        r = i.animating;
      return s.loop
        ? !r &&
            (i.loopFix(),
            (i._clientLeft = i.$wrapperEl[0].clientLeft),
            i.slideTo(i.activeIndex + s.slidesPerGroup, e, t, a))
        : i.slideTo(i.activeIndex + s.slidesPerGroup, e, t, a);
    },
    slidePrev: function (e, t, a) {
      void 0 === e && (e = this.params.speed), void 0 === t && (t = !0);
      var i = this,
        s = i.params,
        r = i.animating,
        n = i.snapGrid,
        o = i.slidesGrid,
        l = i.rtlTranslate;
      if (s.loop) {
        if (r) return !1;
        i.loopFix(), (i._clientLeft = i.$wrapperEl[0].clientLeft);
      }
      function d(e) {
        return e < 0 ? -Math.floor(Math.abs(e)) : Math.floor(e);
      }
      var p,
        c = d(l ? i.translate : -i.translate),
        u = n.map(function (e) {
          return d(e);
        }),
        h =
          (o.map(function (e) {
            return d(e);
          }),
          n[u.indexOf(c)],
          n[u.indexOf(c) - 1]);
      return (
        void 0 !== h && (p = o.indexOf(h)) < 0 && (p = i.activeIndex - 1),
        i.slideTo(p, e, t, a)
      );
    },
    slideReset: function (e, t, a) {
      return (
        void 0 === e && (e = this.params.speed),
        void 0 === t && (t = !0),
        this.slideTo(this.activeIndex, e, t, a)
      );
    },
    slideToClosest: function (e, t, a) {
      void 0 === e && (e = this.params.speed), void 0 === t && (t = !0);
      var i = this,
        s = i.activeIndex,
        r = Math.floor(s / i.params.slidesPerGroup);
      if (r < i.snapGrid.length - 1) {
        var n = i.rtlTranslate ? i.translate : -i.translate,
          o = i.snapGrid[r];
        (i.snapGrid[r + 1] - o) / 2 < n - o && (s = i.params.slidesPerGroup);
      }
      return i.slideTo(s, e, t, a);
    },
    slideToClickedSlide: function () {
      var e,
        t = this,
        a = t.params,
        i = t.$wrapperEl,
        s =
          "auto" === a.slidesPerView
            ? t.slidesPerViewDynamic()
            : a.slidesPerView,
        r = t.clickedIndex;
      if (a.loop) {
        if (t.animating) return;
        (e = parseInt(L(t.clickedSlide).attr("data-swiper-slide-index"), 10)),
          a.centeredSlides
            ? r < t.loopedSlides - s / 2 ||
              r > t.slides.length - t.loopedSlides + s / 2
              ? (t.loopFix(),
                (r = i
                  .children(
                    "." +
                      a.slideClass +
                      '[data-swiper-slide-index="' +
                      e +
                      '"]:not(.' +
                      a.slideDuplicateClass +
                      ")"
                  )
                  .eq(0)
                  .index()),
                X.nextTick(function () {
                  t.slideTo(r);
                }))
              : t.slideTo(r)
            : r > t.slides.length - s
              ? (t.loopFix(),
                (r = i
                  .children(
                    "." +
                      a.slideClass +
                      '[data-swiper-slide-index="' +
                      e +
                      '"]:not(.' +
                      a.slideDuplicateClass +
                      ")"
                  )
                  .eq(0)
                  .index()),
                X.nextTick(function () {
                  t.slideTo(r);
                }))
              : t.slideTo(r);
      } else t.slideTo(r);
    },
  };
  var u = {
    loopCreate: function () {
      var i = this,
        e = i.params,
        t = i.$wrapperEl;
      t.children("." + e.slideClass + "." + e.slideDuplicateClass).remove();
      var s = t.children("." + e.slideClass);
      if (e.loopFillGroupWithBlank) {
        var a = e.slidesPerGroup - (s.length % e.slidesPerGroup);
        if (a !== e.slidesPerGroup) {
          for (var r = 0; r < a; r += 1) {
            var n = L(f.createElement("div")).addClass(
              e.slideClass + " " + e.slideBlankClass
            );
            t.append(n);
          }
          s = t.children("." + e.slideClass);
        }
      }
      "auto" !== e.slidesPerView ||
        e.loopedSlides ||
        (e.loopedSlides = s.length),
        (i.loopedSlides = parseInt(e.loopedSlides || e.slidesPerView, 10)),
        (i.loopedSlides += e.loopAdditionalSlides),
        i.loopedSlides > s.length && (i.loopedSlides = s.length);
      var o = [],
        l = [];
      s.each(function (e, t) {
        var a = L(t);
        e < i.loopedSlides && l.push(t),
          e < s.length && e >= s.length - i.loopedSlides && o.push(t),
          a.attr("data-swiper-slide-index", e);
      });
      for (var d = 0; d < l.length; d += 1)
        t.append(L(l[d].cloneNode(!0)).addClass(e.slideDuplicateClass));
      for (var p = o.length - 1; 0 <= p; p -= 1)
        t.prepend(L(o[p].cloneNode(!0)).addClass(e.slideDuplicateClass));
    },
    loopFix: function () {
      var e,
        t = this,
        a = t.params,
        i = t.activeIndex,
        s = t.slides,
        r = t.loopedSlides,
        n = t.allowSlidePrev,
        o = t.allowSlideNext,
        l = t.snapGrid,
        d = t.rtlTranslate;
      (t.allowSlidePrev = !0), (t.allowSlideNext = !0);
      var p = -l[i] - t.getTranslate();
      i < r
        ? ((e = s.length - 3 * r + i),
          (e += r),
          t.slideTo(e, 0, !1, !0) &&
            0 !== p &&
            t.setTranslate((d ? -t.translate : t.translate) - p))
        : (("auto" === a.slidesPerView && 2 * r <= i) || i >= s.length - r) &&
          ((e = -s.length + i + r),
          (e += r),
          t.slideTo(e, 0, !1, !0) &&
            0 !== p &&
            t.setTranslate((d ? -t.translate : t.translate) - p));
      (t.allowSlidePrev = n), (t.allowSlideNext = o);
    },
    loopDestroy: function () {
      var e = this.$wrapperEl,
        t = this.params,
        a = this.slides;
      e.children("." + t.slideClass + "." + t.slideDuplicateClass).remove(),
        a.removeAttr("data-swiper-slide-index");
    },
  };
  var h = {
    setGrabCursor: function (e) {
      if (
        !(
          Y.touch ||
          !this.params.simulateTouch ||
          (this.params.watchOverflow && this.isLocked)
        )
      ) {
        var t = this.el;
        (t.style.cursor = "move"),
          (t.style.cursor = e ? "-webkit-grabbing" : "-webkit-grab"),
          (t.style.cursor = e ? "-moz-grabbin" : "-moz-grab"),
          (t.style.cursor = e ? "grabbing" : "grab");
      }
    },
    unsetGrabCursor: function () {
      Y.touch ||
        (this.params.watchOverflow && this.isLocked) ||
        (this.el.style.cursor = "");
    },
  };
  var v = {
      appendSlide: function (e) {
        var t = this,
          a = t.$wrapperEl,
          i = t.params;
        if ((i.loop && t.loopDestroy(), "object" == typeof e && "length" in e))
          for (var s = 0; s < e.length; s += 1) e[s] && a.append(e[s]);
        else a.append(e);
        i.loop && t.loopCreate(), (i.observer && Y.observer) || t.update();
      },
      prependSlide: function (e) {
        var t = this,
          a = t.params,
          i = t.$wrapperEl,
          s = t.activeIndex;
        a.loop && t.loopDestroy();
        var r = s + 1;
        if ("object" == typeof e && "length" in e) {
          for (var n = 0; n < e.length; n += 1) e[n] && i.prepend(e[n]);
          r = s + e.length;
        } else i.prepend(e);
        a.loop && t.loopCreate(),
          (a.observer && Y.observer) || t.update(),
          t.slideTo(r, 0, !1);
      },
      addSlide: function (e, t) {
        var a = this,
          i = a.$wrapperEl,
          s = a.params,
          r = a.activeIndex;
        s.loop &&
          ((r -= a.loopedSlides),
          a.loopDestroy(),
          (a.slides = i.children("." + s.slideClass)));
        var n = a.slides.length;
        if (e <= 0) a.prependSlide(t);
        else if (n <= e) a.appendSlide(t);
        else {
          for (var o = e < r ? r + 1 : r, l = [], d = n - 1; e <= d; d -= 1) {
            var p = a.slides.eq(d);
            p.remove(), l.unshift(p);
          }
          if ("object" == typeof t && "length" in t) {
            for (var c = 0; c < t.length; c += 1) t[c] && i.append(t[c]);
            o = e < r ? r + t.length : r;
          } else i.append(t);
          for (var u = 0; u < l.length; u += 1) i.append(l[u]);
          s.loop && a.loopCreate(),
            (s.observer && Y.observer) || a.update(),
            s.loop ? a.slideTo(o + a.loopedSlides, 0, !1) : a.slideTo(o, 0, !1);
        }
      },
      removeSlide: function (e) {
        var t = this,
          a = t.params,
          i = t.$wrapperEl,
          s = t.activeIndex;
        a.loop &&
          ((s -= t.loopedSlides),
          t.loopDestroy(),
          (t.slides = i.children("." + a.slideClass)));
        var r,
          n = s;
        if ("object" == typeof e && "length" in e) {
          for (var o = 0; o < e.length; o += 1)
            (r = e[o]),
              t.slides[r] && t.slides.eq(r).remove(),
              r < n && (n -= 1);
          n = Math.max(n, 0);
        } else
          (r = e),
            t.slides[r] && t.slides.eq(r).remove(),
            r < n && (n -= 1),
            (n = Math.max(n, 0));
        a.loop && t.loopCreate(),
          (a.observer && Y.observer) || t.update(),
          a.loop ? t.slideTo(n + t.loopedSlides, 0, !1) : t.slideTo(n, 0, !1);
      },
      removeAllSlides: function () {
        for (var e = [], t = 0; t < this.slides.length; t += 1) e.push(t);
        this.removeSlide(e);
      },
    },
    m = (function () {
      var e = B.navigator.userAgent,
        t = {
          ios: !1,
          android: !1,
          androidChrome: !1,
          desktop: !1,
          windows: !1,
          iphone: !1,
          ipod: !1,
          ipad: !1,
          cordova: B.cordova || B.phonegap,
          phonegap: B.cordova || B.phonegap,
        },
        a = e.match(/(Windows Phone);?[\s\/]+([\d.]+)?/),
        i = e.match(/(Android);?[\s\/]+([\d.]+)?/),
        s = e.match(/(iPad).*OS\s([\d_]+)/),
        r = e.match(/(iPod)(.*OS\s([\d_]+))?/),
        n = !s && e.match(/(iPhone\sOS|iOS)\s([\d_]+)/);
      if (
        (a && ((t.os = "windows"), (t.osVersion = a[2]), (t.windows = !0)),
        i &&
          !a &&
          ((t.os = "android"),
          (t.osVersion = i[2]),
          (t.android = !0),
          (t.androidChrome = 0 <= e.toLowerCase().indexOf("chrome"))),
        (s || n || r) && ((t.os = "ios"), (t.ios = !0)),
        n && !r && ((t.osVersion = n[2].replace(/_/g, ".")), (t.iphone = !0)),
        s && ((t.osVersion = s[2].replace(/_/g, ".")), (t.ipad = !0)),
        r &&
          ((t.osVersion = r[3] ? r[3].replace(/_/g, ".") : null),
          (t.iphone = !0)),
        t.ios &&
          t.osVersion &&
          0 <= e.indexOf("Version/") &&
          "10" === t.osVersion.split(".")[0] &&
          (t.osVersion = e.toLowerCase().split("version/")[1].split(" ")[0]),
        (t.desktop = !(t.os || t.android || t.webView)),
        (t.webView = (n || s || r) && e.match(/.*AppleWebKit(?!.*Safari)/i)),
        t.os && "ios" === t.os)
      ) {
        var o = t.osVersion.split("."),
          l = f.querySelector('meta[name="viewport"]');
        t.minimalUi =
          !t.webView &&
          (r || n) &&
          (1 * o[0] == 7 ? 1 <= 1 * o[1] : 7 < 1 * o[0]) &&
          l &&
          0 <= l.getAttribute("content").indexOf("minimal-ui");
      }
      return (t.pixelRatio = B.devicePixelRatio || 1), t;
    })();
  function g() {
    var e = this,
      t = e.params,
      a = e.el;
    if (!a || 0 !== a.offsetWidth) {
      t.breakpoints && e.setBreakpoint();
      var i = e.allowSlideNext,
        s = e.allowSlidePrev,
        r = e.snapGrid;
      if (
        ((e.allowSlideNext = !0),
        (e.allowSlidePrev = !0),
        e.updateSize(),
        e.updateSlides(),
        t.freeMode)
      ) {
        var n = Math.min(
          Math.max(e.translate, e.maxTranslate()),
          e.minTranslate()
        );
        e.setTranslate(n),
          e.updateActiveIndex(),
          e.updateSlidesClasses(),
          t.autoHeight && e.updateAutoHeight();
      } else
        e.updateSlidesClasses(),
          ("auto" === t.slidesPerView || 1 < t.slidesPerView) &&
          e.isEnd &&
          !e.params.centeredSlides
            ? e.slideTo(e.slides.length - 1, 0, !1, !0)
            : e.slideTo(e.activeIndex, 0, !1, !0);
      (e.allowSlidePrev = s),
        (e.allowSlideNext = i),
        e.params.watchOverflow && r !== e.snapGrid && e.checkOverflow();
    }
  }
  var b = {
    attachEvents: function () {
      var e = this,
        t = e.params,
        a = e.touchEvents,
        i = e.el,
        s = e.wrapperEl;
      (e.onTouchStart = function (e) {
        var t = this,
          a = t.touchEventsData,
          i = t.params,
          s = t.touches;
        if (!t.animating || !i.preventInteractionOnTransition) {
          var r = e;
          if (
            (r.originalEvent && (r = r.originalEvent),
            (a.isTouchEvent = "touchstart" === r.type),
            (a.isTouchEvent || !("which" in r) || 3 !== r.which) &&
              (!a.isTouched || !a.isMoved))
          )
            if (
              i.noSwiping &&
              L(r.target).closest(
                i.noSwipingSelector
                  ? i.noSwipingSelector
                  : "." + i.noSwipingClass
              )[0]
            )
              t.allowClick = !0;
            else if (!i.swipeHandler || L(r).closest(i.swipeHandler)[0]) {
              (s.currentX =
                "touchstart" === r.type ? r.targetTouches[0].pageX : r.pageX),
                (s.currentY =
                  "touchstart" === r.type ? r.targetTouches[0].pageY : r.pageY);
              var n = s.currentX,
                o = s.currentY,
                l = i.edgeSwipeDetection || i.iOSEdgeSwipeDetection,
                d = i.edgeSwipeThreshold || i.iOSEdgeSwipeThreshold;
              if (!l || !(n <= d || n >= B.screen.width - d)) {
                if (
                  (X.extend(a, {
                    isTouched: !0,
                    isMoved: !1,
                    allowTouchCallbacks: !0,
                    isScrolling: void 0,
                    startMoving: void 0,
                  }),
                  (s.startX = n),
                  (s.startY = o),
                  (a.touchStartTime = X.now()),
                  (t.allowClick = !0),
                  t.updateSize(),
                  (t.swipeDirection = void 0),
                  0 < i.threshold && (a.allowThresholdMove = !1),
                  "touchstart" !== r.type)
                ) {
                  var p = !0;
                  L(r.target).is(a.formElements) && (p = !1),
                    f.activeElement &&
                      L(f.activeElement).is(a.formElements) &&
                      f.activeElement !== r.target &&
                      f.activeElement.blur(),
                    p && t.allowTouchMove && r.preventDefault();
                }
                t.emit("touchStart", r);
              }
            }
        }
      }.bind(e)),
        (e.onTouchMove = function (e) {
          var t = this,
            a = t.touchEventsData,
            i = t.params,
            s = t.touches,
            r = t.rtlTranslate,
            n = e;
          if ((n.originalEvent && (n = n.originalEvent), a.isTouched)) {
            if (!a.isTouchEvent || "mousemove" !== n.type) {
              var o =
                  "touchmove" === n.type ? n.targetTouches[0].pageX : n.pageX,
                l = "touchmove" === n.type ? n.targetTouches[0].pageY : n.pageY;
              if (n.preventedByNestedSwiper)
                return (s.startX = o), void (s.startY = l);
              if (!t.allowTouchMove)
                return (
                  (t.allowClick = !1),
                  void (
                    a.isTouched &&
                    (X.extend(s, {
                      startX: o,
                      startY: l,
                      currentX: o,
                      currentY: l,
                    }),
                    (a.touchStartTime = X.now()))
                  )
                );
              if (a.isTouchEvent && i.touchReleaseOnEdges && !i.loop)
                if (t.isVertical()) {
                  if (
                    (l < s.startY && t.translate <= t.maxTranslate()) ||
                    (l > s.startY && t.translate >= t.minTranslate())
                  )
                    return (a.isTouched = !1), void (a.isMoved = !1);
                } else if (
                  (o < s.startX && t.translate <= t.maxTranslate()) ||
                  (o > s.startX && t.translate >= t.minTranslate())
                )
                  return;
              if (
                a.isTouchEvent &&
                f.activeElement &&
                n.target === f.activeElement &&
                L(n.target).is(a.formElements)
              )
                return (a.isMoved = !0), void (t.allowClick = !1);
              if (
                (a.allowTouchCallbacks && t.emit("touchMove", n),
                !(n.targetTouches && 1 < n.targetTouches.length))
              ) {
                (s.currentX = o), (s.currentY = l);
                var d,
                  p = s.currentX - s.startX,
                  c = s.currentY - s.startY;
                if (
                  !(
                    t.params.threshold &&
                    Math.sqrt(Math.pow(p, 2) + Math.pow(c, 2)) <
                      t.params.threshold
                  )
                )
                  if (
                    (void 0 === a.isScrolling &&
                      ((t.isHorizontal() && s.currentY === s.startY) ||
                      (t.isVertical() && s.currentX === s.startX)
                        ? (a.isScrolling = !1)
                        : 25 <= p * p + c * c &&
                          ((d =
                            (180 * Math.atan2(Math.abs(c), Math.abs(p))) /
                            Math.PI),
                          (a.isScrolling = t.isHorizontal()
                            ? d > i.touchAngle
                            : 90 - d > i.touchAngle))),
                    a.isScrolling && t.emit("touchMoveOpposite", n),
                    void 0 === a.startMoving &&
                      ((s.currentX === s.startX && s.currentY === s.startY) ||
                        (a.startMoving = !0)),
                    a.isScrolling)
                  )
                    a.isTouched = !1;
                  else if (a.startMoving) {
                    (t.allowClick = !1),
                      n.preventDefault(),
                      i.touchMoveStopPropagation &&
                        !i.nested &&
                        n.stopPropagation(),
                      a.isMoved ||
                        (i.loop && t.loopFix(),
                        (a.startTranslate = t.getTranslate()),
                        t.setTransition(0),
                        t.animating &&
                          t.$wrapperEl.trigger(
                            "webkitTransitionEnd transitionend"
                          ),
                        (a.allowMomentumBounce = !1),
                        !i.grabCursor ||
                          (!0 !== t.allowSlideNext &&
                            !0 !== t.allowSlidePrev) ||
                          t.setGrabCursor(!0),
                        t.emit("sliderFirstMove", n)),
                      t.emit("sliderMove", n),
                      (a.isMoved = !0);
                    var u = t.isHorizontal() ? p : c;
                    (s.diff = u),
                      (u *= i.touchRatio),
                      r && (u = -u),
                      (t.swipeDirection = 0 < u ? "prev" : "next"),
                      (a.currentTranslate = u + a.startTranslate);
                    var h = !0,
                      v = i.resistanceRatio;
                    if (
                      (i.touchReleaseOnEdges && (v = 0),
                      0 < u && a.currentTranslate > t.minTranslate()
                        ? ((h = !1),
                          i.resistance &&
                            (a.currentTranslate =
                              t.minTranslate() -
                              1 +
                              Math.pow(
                                -t.minTranslate() + a.startTranslate + u,
                                v
                              )))
                        : u < 0 &&
                          a.currentTranslate < t.maxTranslate() &&
                          ((h = !1),
                          i.resistance &&
                            (a.currentTranslate =
                              t.maxTranslate() +
                              1 -
                              Math.pow(
                                t.maxTranslate() - a.startTranslate - u,
                                v
                              ))),
                      h && (n.preventedByNestedSwiper = !0),
                      !t.allowSlideNext &&
                        "next" === t.swipeDirection &&
                        a.currentTranslate < a.startTranslate &&
                        (a.currentTranslate = a.startTranslate),
                      !t.allowSlidePrev &&
                        "prev" === t.swipeDirection &&
                        a.currentTranslate > a.startTranslate &&
                        (a.currentTranslate = a.startTranslate),
                      0 < i.threshold)
                    ) {
                      if (!(Math.abs(u) > i.threshold || a.allowThresholdMove))
                        return void (a.currentTranslate = a.startTranslate);
                      if (!a.allowThresholdMove)
                        return (
                          (a.allowThresholdMove = !0),
                          (s.startX = s.currentX),
                          (s.startY = s.currentY),
                          (a.currentTranslate = a.startTranslate),
                          void (s.diff = t.isHorizontal()
                            ? s.currentX - s.startX
                            : s.currentY - s.startY)
                        );
                    }
                    i.followFinger &&
                      ((i.freeMode ||
                        i.watchSlidesProgress ||
                        i.watchSlidesVisibility) &&
                        (t.updateActiveIndex(), t.updateSlidesClasses()),
                      i.freeMode &&
                        (0 === a.velocities.length &&
                          a.velocities.push({
                            position: s[t.isHorizontal() ? "startX" : "startY"],
                            time: a.touchStartTime,
                          }),
                        a.velocities.push({
                          position:
                            s[t.isHorizontal() ? "currentX" : "currentY"],
                          time: X.now(),
                        })),
                      t.updateProgress(a.currentTranslate),
                      t.setTranslate(a.currentTranslate));
                  }
              }
            }
          } else
            a.startMoving && a.isScrolling && t.emit("touchMoveOpposite", n);
        }.bind(e)),
        (e.onTouchEnd = function (e) {
          var t = this,
            a = t.touchEventsData,
            i = t.params,
            s = t.touches,
            r = t.rtlTranslate,
            n = t.$wrapperEl,
            o = t.slidesGrid,
            l = t.snapGrid,
            d = e;
          if (
            (d.originalEvent && (d = d.originalEvent),
            a.allowTouchCallbacks && t.emit("touchEnd", d),
            (a.allowTouchCallbacks = !1),
            !a.isTouched)
          )
            return (
              a.isMoved && i.grabCursor && t.setGrabCursor(!1),
              (a.isMoved = !1),
              void (a.startMoving = !1)
            );
          i.grabCursor &&
            a.isMoved &&
            a.isTouched &&
            (!0 === t.allowSlideNext || !0 === t.allowSlidePrev) &&
            t.setGrabCursor(!1);
          var p,
            c = X.now(),
            u = c - a.touchStartTime;
          if (
            (t.allowClick &&
              (t.updateClickedSlide(d),
              t.emit("tap", d),
              u < 300 &&
                300 < c - a.lastClickTime &&
                (a.clickTimeout && clearTimeout(a.clickTimeout),
                (a.clickTimeout = X.nextTick(function () {
                  t && !t.destroyed && t.emit("click", d);
                }, 300))),
              u < 300 &&
                c - a.lastClickTime < 300 &&
                (a.clickTimeout && clearTimeout(a.clickTimeout),
                t.emit("doubleTap", d))),
            (a.lastClickTime = X.now()),
            X.nextTick(function () {
              t.destroyed || (t.allowClick = !0);
            }),
            !a.isTouched ||
              !a.isMoved ||
              !t.swipeDirection ||
              0 === s.diff ||
              a.currentTranslate === a.startTranslate)
          )
            return (
              (a.isTouched = !1), (a.isMoved = !1), void (a.startMoving = !1)
            );
          if (
            ((a.isTouched = !1),
            (a.isMoved = !1),
            (a.startMoving = !1),
            (p = i.followFinger
              ? r
                ? t.translate
                : -t.translate
              : -a.currentTranslate),
            i.freeMode)
          ) {
            if (p < -t.minTranslate()) return void t.slideTo(t.activeIndex);
            if (p > -t.maxTranslate())
              return void (t.slides.length < l.length
                ? t.slideTo(l.length - 1)
                : t.slideTo(t.slides.length - 1));
            if (i.freeModeMomentum) {
              if (1 < a.velocities.length) {
                var h = a.velocities.pop(),
                  v = a.velocities.pop(),
                  f = h.position - v.position,
                  m = h.time - v.time;
                (t.velocity = f / m),
                  (t.velocity /= 2),
                  Math.abs(t.velocity) < i.freeModeMinimumVelocity &&
                    (t.velocity = 0),
                  (150 < m || 300 < X.now() - h.time) && (t.velocity = 0);
              } else t.velocity = 0;
              (t.velocity *= i.freeModeMomentumVelocityRatio),
                (a.velocities.length = 0);
              var g = 1e3 * i.freeModeMomentumRatio,
                b = t.velocity * g,
                w = t.translate + b;
              r && (w = -w);
              var y,
                x,
                E = !1,
                T = 20 * Math.abs(t.velocity) * i.freeModeMomentumBounceRatio;
              if (w < t.maxTranslate())
                i.freeModeMomentumBounce
                  ? (w + t.maxTranslate() < -T && (w = t.maxTranslate() - T),
                    (y = t.maxTranslate()),
                    (E = !0),
                    (a.allowMomentumBounce = !0))
                  : (w = t.maxTranslate()),
                  i.loop && i.centeredSlides && (x = !0);
              else if (w > t.minTranslate())
                i.freeModeMomentumBounce
                  ? (w - t.minTranslate() > T && (w = t.minTranslate() + T),
                    (y = t.minTranslate()),
                    (E = !0),
                    (a.allowMomentumBounce = !0))
                  : (w = t.minTranslate()),
                  i.loop && i.centeredSlides && (x = !0);
              else if (i.freeModeSticky) {
                for (var S, C = 0; C < l.length; C += 1)
                  if (l[C] > -w) {
                    S = C;
                    break;
                  }
                w = -(w =
                  Math.abs(l[S] - w) < Math.abs(l[S - 1] - w) ||
                  "next" === t.swipeDirection
                    ? l[S]
                    : l[S - 1]);
              }
              if (
                (x &&
                  t.once("transitionEnd", function () {
                    t.loopFix();
                  }),
                0 !== t.velocity)
              )
                g = r
                  ? Math.abs((-w - t.translate) / t.velocity)
                  : Math.abs((w - t.translate) / t.velocity);
              else if (i.freeModeSticky) return void t.slideToClosest();
              i.freeModeMomentumBounce && E
                ? (t.updateProgress(y),
                  t.setTransition(g),
                  t.setTranslate(w),
                  t.transitionStart(!0, t.swipeDirection),
                  (t.animating = !0),
                  n.transitionEnd(function () {
                    t &&
                      !t.destroyed &&
                      a.allowMomentumBounce &&
                      (t.emit("momentumBounce"),
                      t.setTransition(i.speed),
                      t.setTranslate(y),
                      n.transitionEnd(function () {
                        t && !t.destroyed && t.transitionEnd();
                      }));
                  }))
                : t.velocity
                  ? (t.updateProgress(w),
                    t.setTransition(g),
                    t.setTranslate(w),
                    t.transitionStart(!0, t.swipeDirection),
                    t.animating ||
                      ((t.animating = !0),
                      n.transitionEnd(function () {
                        t && !t.destroyed && t.transitionEnd();
                      })))
                  : t.updateProgress(w),
                t.updateActiveIndex(),
                t.updateSlidesClasses();
            } else if (i.freeModeSticky) return void t.slideToClosest();
            (!i.freeModeMomentum || u >= i.longSwipesMs) &&
              (t.updateProgress(),
              t.updateActiveIndex(),
              t.updateSlidesClasses());
          } else {
            for (
              var M = 0, z = t.slidesSizesGrid[0], k = 0;
              k < o.length;
              k += i.slidesPerGroup
            )
              void 0 !== o[k + i.slidesPerGroup]
                ? p >= o[k] &&
                  p < o[k + i.slidesPerGroup] &&
                  (z = o[(M = k) + i.slidesPerGroup] - o[k])
                : p >= o[k] &&
                  ((M = k), (z = o[o.length - 1] - o[o.length - 2]));
            var P = (p - o[M]) / z;
            if (u > i.longSwipesMs) {
              if (!i.longSwipes) return void t.slideTo(t.activeIndex);
              "next" === t.swipeDirection &&
                (P >= i.longSwipesRatio
                  ? t.slideTo(M + i.slidesPerGroup)
                  : t.slideTo(M)),
                "prev" === t.swipeDirection &&
                  (P > 1 - i.longSwipesRatio
                    ? t.slideTo(M + i.slidesPerGroup)
                    : t.slideTo(M));
            } else {
              if (!i.shortSwipes) return void t.slideTo(t.activeIndex);
              "next" === t.swipeDirection && t.slideTo(M + i.slidesPerGroup),
                "prev" === t.swipeDirection && t.slideTo(M);
            }
          }
        }.bind(e)),
        (e.onClick = function (e) {
          this.allowClick ||
            (this.params.preventClicks && e.preventDefault(),
            this.params.preventClicksPropagation &&
              this.animating &&
              (e.stopPropagation(), e.stopImmediatePropagation()));
        }.bind(e));
      var r = "container" === t.touchEventsTarget ? i : s,
        n = !!t.nested;
      if (Y.touch || (!Y.pointerEvents && !Y.prefixedPointerEvents)) {
        if (Y.touch) {
          var o = !(
            "touchstart" !== a.start ||
            !Y.passiveListener ||
            !t.passiveListeners
          ) && { passive: !0, capture: !1 };
          r.addEventListener(a.start, e.onTouchStart, o),
            r.addEventListener(
              a.move,
              e.onTouchMove,
              Y.passiveListener ? { passive: !1, capture: n } : n
            ),
            r.addEventListener(a.end, e.onTouchEnd, o);
        }
        ((t.simulateTouch && !m.ios && !m.android) ||
          (t.simulateTouch && !Y.touch && m.ios)) &&
          (r.addEventListener("mousedown", e.onTouchStart, !1),
          f.addEventListener("mousemove", e.onTouchMove, n),
          f.addEventListener("mouseup", e.onTouchEnd, !1));
      } else
        r.addEventListener(a.start, e.onTouchStart, !1),
          f.addEventListener(a.move, e.onTouchMove, n),
          f.addEventListener(a.end, e.onTouchEnd, !1);
      (t.preventClicks || t.preventClicksPropagation) &&
        r.addEventListener("click", e.onClick, !0),
        e.on(
          m.ios || m.android
            ? "resize orientationchange observerUpdate"
            : "resize observerUpdate",
          g,
          !0
        );
    },
    detachEvents: function () {
      var e = this,
        t = e.params,
        a = e.touchEvents,
        i = e.el,
        s = e.wrapperEl,
        r = "container" === t.touchEventsTarget ? i : s,
        n = !!t.nested;
      if (Y.touch || (!Y.pointerEvents && !Y.prefixedPointerEvents)) {
        if (Y.touch) {
          var o = !(
            "onTouchStart" !== a.start ||
            !Y.passiveListener ||
            !t.passiveListeners
          ) && { passive: !0, capture: !1 };
          r.removeEventListener(a.start, e.onTouchStart, o),
            r.removeEventListener(a.move, e.onTouchMove, n),
            r.removeEventListener(a.end, e.onTouchEnd, o);
        }
        ((t.simulateTouch && !m.ios && !m.android) ||
          (t.simulateTouch && !Y.touch && m.ios)) &&
          (r.removeEventListener("mousedown", e.onTouchStart, !1),
          f.removeEventListener("mousemove", e.onTouchMove, n),
          f.removeEventListener("mouseup", e.onTouchEnd, !1));
      } else
        r.removeEventListener(a.start, e.onTouchStart, !1),
          f.removeEventListener(a.move, e.onTouchMove, n),
          f.removeEventListener(a.end, e.onTouchEnd, !1);
      (t.preventClicks || t.preventClicksPropagation) &&
        r.removeEventListener("click", e.onClick, !0),
        e.off(
          m.ios || m.android
            ? "resize orientationchange observerUpdate"
            : "resize observerUpdate",
          g
        );
    },
  };
  var w,
    y = {
      setBreakpoint: function () {
        var e = this,
          t = e.activeIndex,
          a = e.initialized,
          i = e.loopedSlides;
        void 0 === i && (i = 0);
        var s = e.params,
          r = s.breakpoints;
        if (r && (!r || 0 !== Object.keys(r).length)) {
          var n = e.getBreakpoint(r);
          if (n && e.currentBreakpoint !== n) {
            var o = n in r ? r[n] : e.originalParams,
              l = s.loop && o.slidesPerView !== s.slidesPerView;
            X.extend(e.params, o),
              X.extend(e, {
                allowTouchMove: e.params.allowTouchMove,
                allowSlideNext: e.params.allowSlideNext,
                allowSlidePrev: e.params.allowSlidePrev,
              }),
              (e.currentBreakpoint = n),
              l &&
                a &&
                (e.loopDestroy(),
                e.loopCreate(),
                e.updateSlides(),
                e.slideTo(t - i + e.loopedSlides, 0, !1)),
              e.emit("breakpoint", o);
          }
        }
      },
      getBreakpoint: function (e) {
        if (e) {
          var t = !1,
            a = [];
          Object.keys(e).forEach(function (e) {
            a.push(e);
          }),
            a.sort(function (e, t) {
              return parseInt(e, 10) - parseInt(t, 10);
            });
          for (var i = 0; i < a.length; i += 1) {
            var s = a[i];
            s >= B.innerWidth && !t && (t = s);
          }
          return t || "max";
        }
      },
    },
    I = {
      isIE:
        !!B.navigator.userAgent.match(/Trident/g) ||
        !!B.navigator.userAgent.match(/MSIE/g),
      isSafari:
        ((w = B.navigator.userAgent.toLowerCase()),
        0 <= w.indexOf("safari") &&
          w.indexOf("chrome") < 0 &&
          w.indexOf("android") < 0),
      isUiWebView: /(iPhone|iPod|iPad).*AppleWebKit(?!.*Safari)/i.test(
        B.navigator.userAgent
      ),
    };
  var x = {
      init: !0,
      direction: "horizontal",
      touchEventsTarget: "container",
      initialSlide: 0,
      speed: 300,
      preventInteractionOnTransition: !1,
      edgeSwipeDetection: !1,
      edgeSwipeThreshold: 20,
      freeMode: !1,
      freeModeMomentum: !0,
      freeModeMomentumRatio: 1,
      freeModeMomentumBounce: !0,
      freeModeMomentumBounceRatio: 1,
      freeModeMomentumVelocityRatio: 1,
      freeModeSticky: !1,
      freeModeMinimumVelocity: 0.02,
      autoHeight: !1,
      setWrapperSize: !1,
      virtualTranslate: !1,
      effect: "slide",
      breakpoints: void 0,
      spaceBetween: 0,
      slidesPerView: 1,
      slidesPerColumn: 1,
      slidesPerColumnFill: "column",
      slidesPerGroup: 1,
      centeredSlides: !1,
      slidesOffsetBefore: 0,
      slidesOffsetAfter: 0,
      normalizeSlideIndex: !0,
      watchOverflow: !1,
      roundLengths: !1,
      touchRatio: 1,
      touchAngle: 45,
      simulateTouch: !0,
      shortSwipes: !0,
      longSwipes: !0,
      longSwipesRatio: 0.5,
      longSwipesMs: 300,
      followFinger: !0,
      allowTouchMove: !0,
      threshold: 0,
      touchMoveStopPropagation: !0,
      touchReleaseOnEdges: !1,
      uniqueNavElements: !0,
      resistance: !0,
      resistanceRatio: 0.85,
      watchSlidesProgress: !1,
      watchSlidesVisibility: !1,
      grabCursor: !1,
      preventClicks: !0,
      preventClicksPropagation: !0,
      slideToClickedSlide: !1,
      preloadImages: !0,
      updateOnImagesReady: !0,
      loop: !1,
      loopAdditionalSlides: 0,
      loopedSlides: null,
      loopFillGroupWithBlank: !1,
      allowSlidePrev: !0,
      allowSlideNext: !0,
      swipeHandler: null,
      noSwiping: !0,
      noSwipingClass: "swiper-no-swiping",
      noSwipingSelector: null,
      passiveListeners: !0,
      containerModifierClass: "swiper-container-",
      slideClass: "swiper-slide",
      slideBlankClass: "swiper-slide-invisible-blank",
      slideActiveClass: "swiper-slide-active",
      slideDuplicateActiveClass: "swiper-slide-duplicate-active",
      slideVisibleClass: "swiper-slide-visible",
      slideDuplicateClass: "swiper-slide-duplicate",
      slideNextClass: "swiper-slide-next",
      slideDuplicateNextClass: "swiper-slide-duplicate-next",
      slidePrevClass: "swiper-slide-prev",
      slideDuplicatePrevClass: "swiper-slide-duplicate-prev",
      wrapperClass: "swiper-wrapper",
      runCallbacksOnInit: !0,
    },
    E = {
      update: o,
      translate: d,
      transition: p,
      slide: c,
      loop: u,
      grabCursor: h,
      manipulation: v,
      events: b,
      breakpoints: y,
      checkOverflow: {
        checkOverflow: function () {
          var e = this,
            t = e.isLocked;
          (e.isLocked = 1 === e.snapGrid.length),
            (e.allowSlideNext = !e.isLocked),
            (e.allowSlidePrev = !e.isLocked),
            t !== e.isLocked && e.emit(e.isLocked ? "lock" : "unlock"),
            t && t !== e.isLocked && ((e.isEnd = !1), e.navigation.update());
        },
      },
      classes: {
        addClasses: function () {
          var t = this.classNames,
            a = this.params,
            e = this.rtl,
            i = this.$el,
            s = [];
          s.push(a.direction),
            a.freeMode && s.push("free-mode"),
            Y.flexbox || s.push("no-flexbox"),
            a.autoHeight && s.push("autoheight"),
            e && s.push("rtl"),
            1 < a.slidesPerColumn && s.push("multirow"),
            m.android && s.push("android"),
            m.ios && s.push("ios"),
            I.isIE &&
              (Y.pointerEvents || Y.prefixedPointerEvents) &&
              s.push("wp8-" + a.direction),
            s.forEach(function (e) {
              t.push(a.containerModifierClass + e);
            }),
            i.addClass(t.join(" "));
        },
        removeClasses: function () {
          var e = this.$el,
            t = this.classNames;
          e.removeClass(t.join(" "));
        },
      },
      images: {
        loadImage: function (e, t, a, i, s, r) {
          var n;
          function o() {
            r && r();
          }
          e.complete && s
            ? o()
            : t
              ? (((n = new B.Image()).onload = o),
                (n.onerror = o),
                i && (n.sizes = i),
                a && (n.srcset = a),
                t && (n.src = t))
              : o();
        },
        preloadImages: function () {
          var e = this;
          function t() {
            null != e &&
              e &&
              !e.destroyed &&
              (void 0 !== e.imagesLoaded && (e.imagesLoaded += 1),
              e.imagesLoaded === e.imagesToLoad.length &&
                (e.params.updateOnImagesReady && e.update(),
                e.emit("imagesReady")));
          }
          e.imagesToLoad = e.$el.find("img");
          for (var a = 0; a < e.imagesToLoad.length; a += 1) {
            var i = e.imagesToLoad[a];
            e.loadImage(
              i,
              i.currentSrc || i.getAttribute("src"),
              i.srcset || i.getAttribute("srcset"),
              i.sizes || i.getAttribute("sizes"),
              !0,
              t
            );
          }
        },
      },
    },
    T = {},
    S = (function (u) {
      function h() {
        for (var e, t, s, a = [], i = arguments.length; i--; )
          a[i] = arguments[i];
        1 === a.length && a[0].constructor && a[0].constructor === Object
          ? (s = a[0])
          : ((t = (e = a)[0]), (s = e[1])),
          s || (s = {}),
          (s = X.extend({}, s)),
          t && !s.el && (s.el = t),
          u.call(this, s),
          Object.keys(E).forEach(function (t) {
            Object.keys(E[t]).forEach(function (e) {
              h.prototype[e] || (h.prototype[e] = E[t][e]);
            });
          });
        var r = this;
        void 0 === r.modules && (r.modules = {}),
          Object.keys(r.modules).forEach(function (e) {
            var t = r.modules[e];
            if (t.params) {
              var a = Object.keys(t.params)[0],
                i = t.params[a];
              if ("object" != typeof i) return;
              if (!(a in s && "enabled" in i)) return;
              !0 === s[a] && (s[a] = { enabled: !0 }),
                "object" != typeof s[a] ||
                  "enabled" in s[a] ||
                  (s[a].enabled = !0),
                s[a] || (s[a] = { enabled: !1 });
            }
          });
        var n = X.extend({}, x);
        r.useModulesParams(n),
          (r.params = X.extend({}, n, T, s)),
          (r.originalParams = X.extend({}, r.params)),
          (r.passedParams = X.extend({}, s));
        var o = (r.$ = L)(r.params.el);
        if ((t = o[0])) {
          if (1 < o.length) {
            var l = [];
            return (
              o.each(function (e, t) {
                var a = X.extend({}, s, { el: t });
                l.push(new h(a));
              }),
              l
            );
          }
          (t.swiper = r), o.data("swiper", r);
          var d,
            p,
            c = o.children("." + r.params.wrapperClass);
          return (
            X.extend(r, {
              $el: o,
              el: t,
              $wrapperEl: c,
              wrapperEl: c[0],
              classNames: [],
              slides: L(),
              slidesGrid: [],
              snapGrid: [],
              slidesSizesGrid: [],
              isHorizontal: function () {
                return "horizontal" === r.params.direction;
              },
              isVertical: function () {
                return "vertical" === r.params.direction;
              },
              rtl:
                "rtl" === t.dir.toLowerCase() || "rtl" === o.css("direction"),
              rtlTranslate:
                "horizontal" === r.params.direction &&
                ("rtl" === t.dir.toLowerCase() || "rtl" === o.css("direction")),
              wrongRTL: "-webkit-box" === c.css("display"),
              activeIndex: 0,
              realIndex: 0,
              isBeginning: !0,
              isEnd: !1,
              translate: 0,
              previousTranslate: 0,
              progress: 0,
              velocity: 0,
              animating: !1,
              allowSlideNext: r.params.allowSlideNext,
              allowSlidePrev: r.params.allowSlidePrev,
              touchEvents:
                ((d = ["touchstart", "touchmove", "touchend"]),
                (p = ["mousedown", "mousemove", "mouseup"]),
                Y.pointerEvents
                  ? (p = ["pointerdown", "pointermove", "pointerup"])
                  : Y.prefixedPointerEvents &&
                    (p = ["MSPointerDown", "MSPointerMove", "MSPointerUp"]),
                (r.touchEventsTouch = { start: d[0], move: d[1], end: d[2] }),
                (r.touchEventsDesktop = { start: p[0], move: p[1], end: p[2] }),
                Y.touch || !r.params.simulateTouch
                  ? r.touchEventsTouch
                  : r.touchEventsDesktop),
              touchEventsData: {
                isTouched: void 0,
                isMoved: void 0,
                allowTouchCallbacks: void 0,
                touchStartTime: void 0,
                isScrolling: void 0,
                currentTranslate: void 0,
                startTranslate: void 0,
                allowThresholdMove: void 0,
                formElements: "input, select, option, textarea, button, video",
                lastClickTime: X.now(),
                clickTimeout: void 0,
                velocities: [],
                allowMomentumBounce: void 0,
                isTouchEvent: void 0,
                startMoving: void 0,
              },
              allowClick: !0,
              allowTouchMove: r.params.allowTouchMove,
              touches: {
                startX: 0,
                startY: 0,
                currentX: 0,
                currentY: 0,
                diff: 0,
              },
              imagesToLoad: [],
              imagesLoaded: 0,
            }),
            r.useModules(),
            r.params.init && r.init(),
            r
          );
        }
      }
      u && (h.__proto__ = u);
      var e = {
        extendedDefaults: { configurable: !0 },
        defaults: { configurable: !0 },
        Class: { configurable: !0 },
        $: { configurable: !0 },
      };
      return (
        (((h.prototype = Object.create(u && u.prototype)).constructor =
          h).prototype.slidesPerViewDynamic = function () {
          var e = this,
            t = e.params,
            a = e.slides,
            i = e.slidesGrid,
            s = e.size,
            r = e.activeIndex,
            n = 1;
          if (t.centeredSlides) {
            for (
              var o, l = a[r].swiperSlideSize, d = r + 1;
              d < a.length;
              d += 1
            )
              a[d] &&
                !o &&
                ((n += 1), s < (l += a[d].swiperSlideSize) && (o = !0));
            for (var p = r - 1; 0 <= p; p -= 1)
              a[p] &&
                !o &&
                ((n += 1), s < (l += a[p].swiperSlideSize) && (o = !0));
          } else
            for (var c = r + 1; c < a.length; c += 1)
              i[c] - i[r] < s && (n += 1);
          return n;
        }),
        (h.prototype.update = function () {
          var a = this;
          if (a && !a.destroyed) {
            var e = a.snapGrid,
              t = a.params;
            t.breakpoints && a.setBreakpoint(),
              a.updateSize(),
              a.updateSlides(),
              a.updateProgress(),
              a.updateSlidesClasses(),
              a.params.freeMode
                ? (i(), a.params.autoHeight && a.updateAutoHeight())
                : (("auto" === a.params.slidesPerView ||
                    1 < a.params.slidesPerView) &&
                  a.isEnd &&
                  !a.params.centeredSlides
                    ? a.slideTo(a.slides.length - 1, 0, !1, !0)
                    : a.slideTo(a.activeIndex, 0, !1, !0)) || i(),
              t.watchOverflow && e !== a.snapGrid && a.checkOverflow(),
              a.emit("update");
          }
          function i() {
            var e = a.rtlTranslate ? -1 * a.translate : a.translate,
              t = Math.min(Math.max(e, a.maxTranslate()), a.minTranslate());
            a.setTranslate(t), a.updateActiveIndex(), a.updateSlidesClasses();
          }
        }),
        (h.prototype.init = function () {
          var e = this;
          e.initialized ||
            (e.emit("beforeInit"),
            e.params.breakpoints && e.setBreakpoint(),
            e.addClasses(),
            e.params.loop && e.loopCreate(),
            e.updateSize(),
            e.updateSlides(),
            e.params.watchOverflow && e.checkOverflow(),
            e.params.grabCursor && e.setGrabCursor(),
            e.params.preloadImages && e.preloadImages(),
            e.params.loop
              ? e.slideTo(
                  e.params.initialSlide + e.loopedSlides,
                  0,
                  e.params.runCallbacksOnInit
                )
              : e.slideTo(
                  e.params.initialSlide,
                  0,
                  e.params.runCallbacksOnInit
                ),
            e.attachEvents(),
            (e.initialized = !0),
            e.emit("init"));
        }),
        (h.prototype.destroy = function (e, t) {
          void 0 === e && (e = !0), void 0 === t && (t = !0);
          var a = this,
            i = a.params,
            s = a.$el,
            r = a.$wrapperEl,
            n = a.slides;
          return (
            void 0 === a.params ||
              a.destroyed ||
              (a.emit("beforeDestroy"),
              (a.initialized = !1),
              a.detachEvents(),
              i.loop && a.loopDestroy(),
              t &&
                (a.removeClasses(),
                s.removeAttr("style"),
                r.removeAttr("style"),
                n &&
                  n.length &&
                  n
                    .removeClass(
                      [
                        i.slideVisibleClass,
                        i.slideActiveClass,
                        i.slideNextClass,
                        i.slidePrevClass,
                      ].join(" ")
                    )
                    .removeAttr("style")
                    .removeAttr("data-swiper-slide-index")
                    .removeAttr("data-swiper-column")
                    .removeAttr("data-swiper-row")),
              a.emit("destroy"),
              Object.keys(a.eventsListeners).forEach(function (e) {
                a.off(e);
              }),
              !1 !== e &&
                ((a.$el[0].swiper = null),
                a.$el.data("swiper", null),
                X.deleteProps(a)),
              (a.destroyed = !0)),
            null
          );
        }),
        (h.extendDefaults = function (e) {
          X.extend(T, e);
        }),
        (e.extendedDefaults.get = function () {
          return T;
        }),
        (e.defaults.get = function () {
          return x;
        }),
        (e.Class.get = function () {
          return u;
        }),
        (e.$.get = function () {
          return L;
        }),
        Object.defineProperties(h, e),
        h
      );
    })(s),
    C = { name: "device", proto: { device: m }, static: { device: m } },
    M = { name: "support", proto: { support: Y }, static: { support: Y } },
    z = { name: "browser", proto: { browser: I }, static: { browser: I } },
    k = {
      name: "resize",
      create: function () {
        var e = this;
        X.extend(e, {
          resize: {
            resizeHandler: function () {
              e &&
                !e.destroyed &&
                e.initialized &&
                (e.emit("beforeResize"), e.emit("resize"));
            },
            orientationChangeHandler: function () {
              e && !e.destroyed && e.initialized && e.emit("orientationchange");
            },
          },
        });
      },
      on: {
        init: function () {
          B.addEventListener("resize", this.resize.resizeHandler),
            B.addEventListener(
              "orientationchange",
              this.resize.orientationChangeHandler
            );
        },
        destroy: function () {
          B.removeEventListener("resize", this.resize.resizeHandler),
            B.removeEventListener(
              "orientationchange",
              this.resize.orientationChangeHandler
            );
        },
      },
    },
    P = {
      func: B.MutationObserver || B.WebkitMutationObserver,
      attach: function (e, t) {
        void 0 === t && (t = {});
        var a = this,
          i = new P.func(function (e) {
            if (1 !== e.length) {
              var t = function () {
                a.emit("observerUpdate", e[0]);
              };
              B.requestAnimationFrame
                ? B.requestAnimationFrame(t)
                : B.setTimeout(t, 0);
            } else a.emit("observerUpdate", e[0]);
          });
        i.observe(e, {
          attributes: void 0 === t.attributes || t.attributes,
          childList: void 0 === t.childList || t.childList,
          characterData: void 0 === t.characterData || t.characterData,
        }),
          a.observer.observers.push(i);
      },
      init: function () {
        var e = this;
        if (Y.observer && e.params.observer) {
          if (e.params.observeParents)
            for (var t = e.$el.parents(), a = 0; a < t.length; a += 1)
              e.observer.attach(t[a]);
          e.observer.attach(e.$el[0], { childList: !1 }),
            e.observer.attach(e.$wrapperEl[0], { attributes: !1 });
        }
      },
      destroy: function () {
        this.observer.observers.forEach(function (e) {
          e.disconnect();
        }),
          (this.observer.observers = []);
      },
    },
    $ = {
      name: "observer",
      params: { observer: !1, observeParents: !1 },
      create: function () {
        X.extend(this, {
          observer: {
            init: P.init.bind(this),
            attach: P.attach.bind(this),
            destroy: P.destroy.bind(this),
            observers: [],
          },
        });
      },
      on: {
        init: function () {
          this.observer.init();
        },
        destroy: function () {
          this.observer.destroy();
        },
      },
    },
    D = {
      update: function (e) {
        var t = this,
          a = t.params,
          i = a.slidesPerView,
          s = a.slidesPerGroup,
          r = a.centeredSlides,
          n = t.virtual,
          o = n.from,
          l = n.to,
          d = n.slides,
          p = n.slidesGrid,
          c = n.renderSlide,
          u = n.offset;
        t.updateActiveIndex();
        var h,
          v,
          f,
          m = t.activeIndex || 0;
        (h = t.rtlTranslate ? "right" : t.isHorizontal() ? "left" : "top"),
          r
            ? ((v = Math.floor(i / 2) + s), (f = Math.floor(i / 2) + s))
            : ((v = i + (s - 1)), (f = s));
        var g = Math.max((m || 0) - f, 0),
          b = Math.min((m || 0) + v, d.length - 1),
          w = (t.slidesGrid[g] || 0) - (t.slidesGrid[0] || 0);
        function y() {
          t.updateSlides(),
            t.updateProgress(),
            t.updateSlidesClasses(),
            t.lazy && t.params.lazy.enabled && t.lazy.load();
        }
        if (
          (X.extend(t.virtual, {
            from: g,
            to: b,
            offset: w,
            slidesGrid: t.slidesGrid,
          }),
          o === g && l === b && !e)
        )
          return (
            t.slidesGrid !== p && w !== u && t.slides.css(h, w + "px"),
            void t.updateProgress()
          );
        if (t.params.virtual.renderExternal)
          return (
            t.params.virtual.renderExternal.call(t, {
              offset: w,
              from: g,
              to: b,
              slides: (function () {
                for (var e = [], t = g; t <= b; t += 1) e.push(d[t]);
                return e;
              })(),
            }),
            void y()
          );
        var x = [],
          E = [];
        if (e) t.$wrapperEl.find("." + t.params.slideClass).remove();
        else
          for (var T = o; T <= l; T += 1)
            (T < g || b < T) &&
              t.$wrapperEl
                .find(
                  "." +
                    t.params.slideClass +
                    '[data-swiper-slide-index="' +
                    T +
                    '"]'
                )
                .remove();
        for (var S = 0; S < d.length; S += 1)
          g <= S &&
            S <= b &&
            (void 0 === l || e
              ? E.push(S)
              : (l < S && E.push(S), S < o && x.push(S)));
        E.forEach(function (e) {
          t.$wrapperEl.append(c(d[e], e));
        }),
          x
            .sort(function (e, t) {
              return e < t;
            })
            .forEach(function (e) {
              t.$wrapperEl.prepend(c(d[e], e));
            }),
          t.$wrapperEl.children(".swiper-slide").css(h, w + "px"),
          y();
      },
      renderSlide: function (e, t) {
        var a = this,
          i = a.params.virtual;
        if (i.cache && a.virtual.cache[t]) return a.virtual.cache[t];
        var s = i.renderSlide
          ? L(i.renderSlide.call(a, e, t))
          : L(
              '<div class="' +
                a.params.slideClass +
                '" data-swiper-slide-index="' +
                t +
                '">' +
                e +
                "</div>"
            );
        return (
          s.attr("data-swiper-slide-index") ||
            s.attr("data-swiper-slide-index", t),
          i.cache && (a.virtual.cache[t] = s),
          s
        );
      },
      appendSlide: function (e) {
        this.virtual.slides.push(e), this.virtual.update(!0);
      },
      prependSlide: function (e) {
        var t = this;
        if ((t.virtual.slides.unshift(e), t.params.virtual.cache)) {
          var a = t.virtual.cache,
            i = {};
          Object.keys(a).forEach(function (e) {
            i[e + 1] = a[e];
          }),
            (t.virtual.cache = i);
        }
        t.virtual.update(!0), t.slideNext(0);
      },
    },
    O = {
      name: "virtual",
      params: {
        virtual: {
          enabled: !1,
          slides: [],
          cache: !0,
          renderSlide: null,
          renderExternal: null,
        },
      },
      create: function () {
        var e = this;
        X.extend(e, {
          virtual: {
            update: D.update.bind(e),
            appendSlide: D.appendSlide.bind(e),
            prependSlide: D.prependSlide.bind(e),
            renderSlide: D.renderSlide.bind(e),
            slides: e.params.virtual.slides,
            cache: {},
          },
        });
      },
      on: {
        beforeInit: function () {
          var e = this;
          if (e.params.virtual.enabled) {
            e.classNames.push(e.params.containerModifierClass + "virtual");
            var t = { watchSlidesProgress: !0 };
            X.extend(e.params, t),
              X.extend(e.originalParams, t),
              e.virtual.update();
          }
        },
        setTranslate: function () {
          this.params.virtual.enabled && this.virtual.update();
        },
      },
    },
    A = {
      handle: function (e) {
        var t = this,
          a = t.rtlTranslate,
          i = e;
        i.originalEvent && (i = i.originalEvent);
        var s = i.keyCode || i.charCode;
        if (
          !t.allowSlideNext &&
          ((t.isHorizontal() && 39 === s) || (t.isVertical() && 40 === s))
        )
          return !1;
        if (
          !t.allowSlidePrev &&
          ((t.isHorizontal() && 37 === s) || (t.isVertical() && 38 === s))
        )
          return !1;
        if (
          !(
            i.shiftKey ||
            i.altKey ||
            i.ctrlKey ||
            i.metaKey ||
            (f.activeElement &&
              f.activeElement.nodeName &&
              ("input" === f.activeElement.nodeName.toLowerCase() ||
                "textarea" === f.activeElement.nodeName.toLowerCase()))
          )
        ) {
          if (
            t.params.keyboard.onlyInViewport &&
            (37 === s || 39 === s || 38 === s || 40 === s)
          ) {
            var r = !1;
            if (
              0 < t.$el.parents("." + t.params.slideClass).length &&
              0 === t.$el.parents("." + t.params.slideActiveClass).length
            )
              return;
            var n = B.innerWidth,
              o = B.innerHeight,
              l = t.$el.offset();
            a && (l.left -= t.$el[0].scrollLeft);
            for (
              var d = [
                  [l.left, l.top],
                  [l.left + t.width, l.top],
                  [l.left, l.top + t.height],
                  [l.left + t.width, l.top + t.height],
                ],
                p = 0;
              p < d.length;
              p += 1
            ) {
              var c = d[p];
              0 <= c[0] && c[0] <= n && 0 <= c[1] && c[1] <= o && (r = !0);
            }
            if (!r) return;
          }
          t.isHorizontal()
            ? ((37 !== s && 39 !== s) ||
                (i.preventDefault ? i.preventDefault() : (i.returnValue = !1)),
              ((39 === s && !a) || (37 === s && a)) && t.slideNext(),
              ((37 === s && !a) || (39 === s && a)) && t.slidePrev())
            : ((38 !== s && 40 !== s) ||
                (i.preventDefault ? i.preventDefault() : (i.returnValue = !1)),
              40 === s && t.slideNext(),
              38 === s && t.slidePrev()),
            t.emit("keyPress", s);
        }
      },
      enable: function () {
        this.keyboard.enabled ||
          (L(f).on("keydown", this.keyboard.handle),
          (this.keyboard.enabled = !0));
      },
      disable: function () {
        this.keyboard.enabled &&
          (L(f).off("keydown", this.keyboard.handle),
          (this.keyboard.enabled = !1));
      },
    },
    H = {
      name: "keyboard",
      params: { keyboard: { enabled: !1, onlyInViewport: !0 } },
      create: function () {
        X.extend(this, {
          keyboard: {
            enabled: !1,
            enable: A.enable.bind(this),
            disable: A.disable.bind(this),
            handle: A.handle.bind(this),
          },
        });
      },
      on: {
        init: function () {
          this.params.keyboard.enabled && this.keyboard.enable();
        },
        destroy: function () {
          this.keyboard.enabled && this.keyboard.disable();
        },
      },
    };
  var G = {
      lastScrollTime: X.now(),
      event:
        -1 < B.navigator.userAgent.indexOf("firefox")
          ? "DOMMouseScroll"
          : (function () {
                var e = "onwheel",
                  t = e in f;
                if (!t) {
                  var a = f.createElement("div");
                  a.setAttribute(e, "return;"), (t = "function" == typeof a[e]);
                }
                return (
                  !t &&
                    f.implementation &&
                    f.implementation.hasFeature &&
                    !0 !== f.implementation.hasFeature("", "") &&
                    (t = f.implementation.hasFeature("Events.wheel", "3.0")),
                  t
                );
              })()
            ? "wheel"
            : "mousewheel",
      normalize: function (e) {
        var t = 0,
          a = 0,
          i = 0,
          s = 0;
        return (
          "detail" in e && (a = e.detail),
          "wheelDelta" in e && (a = -e.wheelDelta / 120),
          "wheelDeltaY" in e && (a = -e.wheelDeltaY / 120),
          "wheelDeltaX" in e && (t = -e.wheelDeltaX / 120),
          "axis" in e && e.axis === e.HORIZONTAL_AXIS && ((t = a), (a = 0)),
          (i = 10 * t),
          (s = 10 * a),
          "deltaY" in e && (s = e.deltaY),
          "deltaX" in e && (i = e.deltaX),
          (i || s) &&
            e.deltaMode &&
            (1 === e.deltaMode
              ? ((i *= 40), (s *= 40))
              : ((i *= 800), (s *= 800))),
          i && !t && (t = i < 1 ? -1 : 1),
          s && !a && (a = s < 1 ? -1 : 1),
          { spinX: t, spinY: a, pixelX: i, pixelY: s }
        );
      },
      handleMouseEnter: function () {
        this.mouseEntered = !0;
      },
      handleMouseLeave: function () {
        this.mouseEntered = !1;
      },
      handle: function (e) {
        var t = e,
          a = this,
          i = a.params.mousewheel;
        if (!a.mouseEntered && !i.releaseOnEdges) return !0;
        t.originalEvent && (t = t.originalEvent);
        var s = 0,
          r = a.rtlTranslate ? -1 : 1,
          n = G.normalize(t);
        if (i.forceToAxis)
          if (a.isHorizontal()) {
            if (!(Math.abs(n.pixelX) > Math.abs(n.pixelY))) return !0;
            s = n.pixelX * r;
          } else {
            if (!(Math.abs(n.pixelY) > Math.abs(n.pixelX))) return !0;
            s = n.pixelY;
          }
        else
          s =
            Math.abs(n.pixelX) > Math.abs(n.pixelY) ? -n.pixelX * r : -n.pixelY;
        if (0 === s) return !0;
        if ((i.invert && (s = -s), a.params.freeMode)) {
          a.params.loop && a.loopFix();
          var o = a.getTranslate() + s * i.sensitivity,
            l = a.isBeginning,
            d = a.isEnd;
          if (
            (o >= a.minTranslate() && (o = a.minTranslate()),
            o <= a.maxTranslate() && (o = a.maxTranslate()),
            a.setTransition(0),
            a.setTranslate(o),
            a.updateProgress(),
            a.updateActiveIndex(),
            a.updateSlidesClasses(),
            ((!l && a.isBeginning) || (!d && a.isEnd)) &&
              a.updateSlidesClasses(),
            a.params.freeModeSticky &&
              (clearTimeout(a.mousewheel.timeout),
              (a.mousewheel.timeout = X.nextTick(function () {
                a.slideToClosest();
              }, 300))),
            a.emit("scroll", t),
            a.params.autoplay &&
              a.params.autoplayDisableOnInteraction &&
              a.autoplay.stop(),
            o === a.minTranslate() || o === a.maxTranslate())
          )
            return !0;
        } else {
          if (60 < X.now() - a.mousewheel.lastScrollTime)
            if (s < 0)
              if ((a.isEnd && !a.params.loop) || a.animating) {
                if (i.releaseOnEdges) return !0;
              } else a.slideNext(), a.emit("scroll", t);
            else if ((a.isBeginning && !a.params.loop) || a.animating) {
              if (i.releaseOnEdges) return !0;
            } else a.slidePrev(), a.emit("scroll", t);
          a.mousewheel.lastScrollTime = new B.Date().getTime();
        }
        return t.preventDefault ? t.preventDefault() : (t.returnValue = !1), !1;
      },
      enable: function () {
        var e = this;
        if (!G.event) return !1;
        if (e.mousewheel.enabled) return !1;
        var t = e.$el;
        return (
          "container" !== e.params.mousewheel.eventsTarged &&
            (t = L(e.params.mousewheel.eventsTarged)),
          t.on("mouseenter", e.mousewheel.handleMouseEnter),
          t.on("mouseleave", e.mousewheel.handleMouseLeave),
          t.on(G.event, e.mousewheel.handle),
          (e.mousewheel.enabled = !0)
        );
      },
      disable: function () {
        var e = this;
        if (!G.event) return !1;
        if (!e.mousewheel.enabled) return !1;
        var t = e.$el;
        return (
          "container" !== e.params.mousewheel.eventsTarged &&
            (t = L(e.params.mousewheel.eventsTarged)),
          t.off(G.event, e.mousewheel.handle),
          !(e.mousewheel.enabled = !1)
        );
      },
    },
    N = {
      update: function () {
        var e = this,
          t = e.params.navigation;
        if (!e.params.loop) {
          var a = e.navigation,
            i = a.$nextEl,
            s = a.$prevEl;
          s &&
            0 < s.length &&
            (e.isBeginning
              ? s.addClass(t.disabledClass)
              : s.removeClass(t.disabledClass),
            s[
              e.params.watchOverflow && e.isLocked ? "addClass" : "removeClass"
            ](t.lockClass)),
            i &&
              0 < i.length &&
              (e.isEnd
                ? i.addClass(t.disabledClass)
                : i.removeClass(t.disabledClass),
              i[
                e.params.watchOverflow && e.isLocked
                  ? "addClass"
                  : "removeClass"
              ](t.lockClass));
        }
      },
      init: function () {
        var e,
          t,
          a = this,
          i = a.params.navigation;
        (i.nextEl || i.prevEl) &&
          (i.nextEl &&
            ((e = L(i.nextEl)),
            a.params.uniqueNavElements &&
              "string" == typeof i.nextEl &&
              1 < e.length &&
              1 === a.$el.find(i.nextEl).length &&
              (e = a.$el.find(i.nextEl))),
          i.prevEl &&
            ((t = L(i.prevEl)),
            a.params.uniqueNavElements &&
              "string" == typeof i.prevEl &&
              1 < t.length &&
              1 === a.$el.find(i.prevEl).length &&
              (t = a.$el.find(i.prevEl))),
          e &&
            0 < e.length &&
            e.on("click", function (e) {
              e.preventDefault(), (a.isEnd && !a.params.loop) || a.slideNext();
            }),
          t &&
            0 < t.length &&
            t.on("click", function (e) {
              e.preventDefault(),
                (a.isBeginning && !a.params.loop) || a.slidePrev();
            }),
          X.extend(a.navigation, {
            $nextEl: e,
            nextEl: e && e[0],
            $prevEl: t,
            prevEl: t && t[0],
          }));
      },
      destroy: function () {
        var e = this.navigation,
          t = e.$nextEl,
          a = e.$prevEl;
        t &&
          t.length &&
          (t.off("click"), t.removeClass(this.params.navigation.disabledClass)),
          a &&
            a.length &&
            (a.off("click"),
            a.removeClass(this.params.navigation.disabledClass));
      },
    },
    V = {
      update: function () {
        var e = this,
          t = e.rtl,
          s = e.params.pagination;
        if (
          s.el &&
          e.pagination.el &&
          e.pagination.$el &&
          0 !== e.pagination.$el.length
        ) {
          var r,
            a =
              e.virtual && e.params.virtual.enabled
                ? e.virtual.slides.length
                : e.slides.length,
            i = e.pagination.$el,
            n = e.params.loop
              ? Math.ceil((a - 2 * e.loopedSlides) / e.params.slidesPerGroup)
              : e.snapGrid.length;
          if (
            (e.params.loop
              ? ((r = Math.ceil(
                  (e.activeIndex - e.loopedSlides) / e.params.slidesPerGroup
                )) >
                  a - 1 - 2 * e.loopedSlides && (r -= a - 2 * e.loopedSlides),
                n - 1 < r && (r -= n),
                r < 0 && "bullets" !== e.params.paginationType && (r = n + r))
              : (r = void 0 !== e.snapIndex ? e.snapIndex : e.activeIndex || 0),
            "bullets" === s.type &&
              e.pagination.bullets &&
              0 < e.pagination.bullets.length)
          ) {
            var o,
              l,
              d,
              p = e.pagination.bullets;
            if (
              (s.dynamicBullets &&
                ((e.pagination.bulletSize = p
                  .eq(0)
                  [e.isHorizontal() ? "outerWidth" : "outerHeight"](!0)),
                i.css(
                  e.isHorizontal() ? "width" : "height",
                  e.pagination.bulletSize * (s.dynamicMainBullets + 4) + "px"
                ),
                1 < s.dynamicMainBullets &&
                  void 0 !== e.previousIndex &&
                  ((e.pagination.dynamicBulletIndex += r - e.previousIndex),
                  e.pagination.dynamicBulletIndex > s.dynamicMainBullets - 1
                    ? (e.pagination.dynamicBulletIndex =
                        s.dynamicMainBullets - 1)
                    : e.pagination.dynamicBulletIndex < 0 &&
                      (e.pagination.dynamicBulletIndex = 0)),
                (o = r - e.pagination.dynamicBulletIndex),
                (d =
                  ((l = o + (Math.min(p.length, s.dynamicMainBullets) - 1)) +
                    o) /
                  2)),
              p.removeClass(
                s.bulletActiveClass +
                  " " +
                  s.bulletActiveClass +
                  "-next " +
                  s.bulletActiveClass +
                  "-next-next " +
                  s.bulletActiveClass +
                  "-prev " +
                  s.bulletActiveClass +
                  "-prev-prev " +
                  s.bulletActiveClass +
                  "-main"
              ),
              1 < i.length)
            )
              p.each(function (e, t) {
                var a = L(t),
                  i = a.index();
                i === r && a.addClass(s.bulletActiveClass),
                  s.dynamicBullets &&
                    (o <= i &&
                      i <= l &&
                      a.addClass(s.bulletActiveClass + "-main"),
                    i === o &&
                      a
                        .prev()
                        .addClass(s.bulletActiveClass + "-prev")
                        .prev()
                        .addClass(s.bulletActiveClass + "-prev-prev"),
                    i === l &&
                      a
                        .next()
                        .addClass(s.bulletActiveClass + "-next")
                        .next()
                        .addClass(s.bulletActiveClass + "-next-next"));
              });
            else if (
              (p.eq(r).addClass(s.bulletActiveClass), s.dynamicBullets)
            ) {
              for (var c = p.eq(o), u = p.eq(l), h = o; h <= l; h += 1)
                p.eq(h).addClass(s.bulletActiveClass + "-main");
              c
                .prev()
                .addClass(s.bulletActiveClass + "-prev")
                .prev()
                .addClass(s.bulletActiveClass + "-prev-prev"),
                u
                  .next()
                  .addClass(s.bulletActiveClass + "-next")
                  .next()
                  .addClass(s.bulletActiveClass + "-next-next");
            }
            if (s.dynamicBullets) {
              var v = Math.min(p.length, s.dynamicMainBullets + 4),
                f =
                  (e.pagination.bulletSize * v - e.pagination.bulletSize) / 2 -
                  d * e.pagination.bulletSize,
                m = t ? "right" : "left";
              p.css(e.isHorizontal() ? m : "top", f + "px");
            }
          }
          if (
            ("fraction" === s.type &&
              (i
                .find("." + s.currentClass)
                .text(s.formatFractionCurrent(r + 1)),
              i.find("." + s.totalClass).text(s.formatFractionTotal(n))),
            "progressbar" === s.type)
          ) {
            var g;
            g = s.progressbarOpposite
              ? e.isHorizontal()
                ? "vertical"
                : "horizontal"
              : e.isHorizontal()
                ? "horizontal"
                : "vertical";
            var b = (r + 1) / n,
              w = 1,
              y = 1;
            "horizontal" === g ? (w = b) : (y = b),
              i
                .find("." + s.progressbarFillClass)
                .transform(
                  "translate3d(0,0,0) scaleX(" + w + ") scaleY(" + y + ")"
                )
                .transition(e.params.speed);
          }
          "custom" === s.type && s.renderCustom
            ? (i.html(s.renderCustom(e, r + 1, n)),
              e.emit("paginationRender", e, i[0]))
            : e.emit("paginationUpdate", e, i[0]),
            i[
              e.params.watchOverflow && e.isLocked ? "addClass" : "removeClass"
            ](s.lockClass);
        }
      },
      render: function () {
        var e = this,
          t = e.params.pagination;
        if (
          t.el &&
          e.pagination.el &&
          e.pagination.$el &&
          0 !== e.pagination.$el.length
        ) {
          var a =
              e.virtual && e.params.virtual.enabled
                ? e.virtual.slides.length
                : e.slides.length,
            i = e.pagination.$el,
            s = "";
          if ("bullets" === t.type) {
            for (
              var r = e.params.loop
                  ? Math.ceil(
                      (a - 2 * e.loopedSlides) / e.params.slidesPerGroup
                    )
                  : e.snapGrid.length,
                n = 0;
              n < r;
              n += 1
            )
              t.renderBullet
                ? (s += t.renderBullet.call(e, n, t.bulletClass))
                : (s +=
                    "<" +
                    t.bulletElement +
                    ' class="' +
                    t.bulletClass +
                    '"></' +
                    t.bulletElement +
                    ">");
            i.html(s), (e.pagination.bullets = i.find("." + t.bulletClass));
          }
          "fraction" === t.type &&
            ((s = t.renderFraction
              ? t.renderFraction.call(e, t.currentClass, t.totalClass)
              : '<span class="' +
                t.currentClass +
                '"></span> / <span class="' +
                t.totalClass +
                '"></span>'),
            i.html(s)),
            "progressbar" === t.type &&
              ((s = t.renderProgressbar
                ? t.renderProgressbar.call(e, t.progressbarFillClass)
                : '<span class="' + t.progressbarFillClass + '"></span>'),
              i.html(s)),
            "custom" !== t.type &&
              e.emit("paginationRender", e.pagination.$el[0]);
        }
      },
      init: function () {
        var a = this,
          e = a.params.pagination;
        if (e.el) {
          var t = L(e.el);
          0 !== t.length &&
            (a.params.uniqueNavElements &&
              "string" == typeof e.el &&
              1 < t.length &&
              1 === a.$el.find(e.el).length &&
              (t = a.$el.find(e.el)),
            "bullets" === e.type && e.clickable && t.addClass(e.clickableClass),
            t.addClass(e.modifierClass + e.type),
            "bullets" === e.type &&
              e.dynamicBullets &&
              (t.addClass("" + e.modifierClass + e.type + "-dynamic"),
              (a.pagination.dynamicBulletIndex = 0),
              e.dynamicMainBullets < 1 && (e.dynamicMainBullets = 1)),
            "progressbar" === e.type &&
              e.progressbarOpposite &&
              t.addClass(e.progressbarOppositeClass),
            e.clickable &&
              t.on("click", "." + e.bulletClass, function (e) {
                e.preventDefault();
                var t = L(this).index() * a.params.slidesPerGroup;
                a.params.loop && (t += a.loopedSlides), a.slideTo(t);
              }),
            X.extend(a.pagination, { $el: t, el: t[0] }));
        }
      },
      destroy: function () {
        var e = this,
          t = e.params.pagination;
        if (
          t.el &&
          e.pagination.el &&
          e.pagination.$el &&
          0 !== e.pagination.$el.length
        ) {
          var a = e.pagination.$el;
          a.removeClass(t.hiddenClass),
            a.removeClass(t.modifierClass + t.type),
            e.pagination.bullets &&
              e.pagination.bullets.removeClass(t.bulletActiveClass),
            t.clickable && a.off("click", "." + t.bulletClass);
        }
      },
    },
    R = {
      setTranslate: function () {
        var e = this;
        if (e.params.scrollbar.el && e.scrollbar.el) {
          var t = e.scrollbar,
            a = e.rtlTranslate,
            i = e.progress,
            s = t.dragSize,
            r = t.trackSize,
            n = t.$dragEl,
            o = t.$el,
            l = e.params.scrollbar,
            d = s,
            p = (r - s) * i;
          a
            ? 0 < (p = -p)
              ? ((d = s - p), (p = 0))
              : r < -p + s && (d = r + p)
            : p < 0
              ? ((d = s + p), (p = 0))
              : r < p + s && (d = r - p),
            e.isHorizontal()
              ? (Y.transforms3d
                  ? n.transform("translate3d(" + p + "px, 0, 0)")
                  : n.transform("translateX(" + p + "px)"),
                (n[0].style.width = d + "px"))
              : (Y.transforms3d
                  ? n.transform("translate3d(0px, " + p + "px, 0)")
                  : n.transform("translateY(" + p + "px)"),
                (n[0].style.height = d + "px")),
            l.hide &&
              (clearTimeout(e.scrollbar.timeout),
              (o[0].style.opacity = 1),
              (e.scrollbar.timeout = setTimeout(function () {
                (o[0].style.opacity = 0), o.transition(400);
              }, 1e3)));
        }
      },
      setTransition: function (e) {
        this.params.scrollbar.el &&
          this.scrollbar.el &&
          this.scrollbar.$dragEl.transition(e);
      },
      updateSize: function () {
        var e = this;
        if (e.params.scrollbar.el && e.scrollbar.el) {
          var t = e.scrollbar,
            a = t.$dragEl,
            i = t.$el;
          (a[0].style.width = ""), (a[0].style.height = "");
          var s,
            r = e.isHorizontal() ? i[0].offsetWidth : i[0].offsetHeight,
            n = e.size / e.virtualSize,
            o = n * (r / e.size);
          (s =
            "auto" === e.params.scrollbar.dragSize
              ? r * n
              : parseInt(e.params.scrollbar.dragSize, 10)),
            e.isHorizontal()
              ? (a[0].style.width = s + "px")
              : (a[0].style.height = s + "px"),
            (i[0].style.display = 1 <= n ? "none" : ""),
            e.params.scrollbarHide && (i[0].style.opacity = 0),
            X.extend(t, {
              trackSize: r,
              divider: n,
              moveDivider: o,
              dragSize: s,
            }),
            t.$el[
              e.params.watchOverflow && e.isLocked ? "addClass" : "removeClass"
            ](e.params.scrollbar.lockClass);
        }
      },
      setDragPosition: function (e) {
        var t,
          a = this,
          i = a.scrollbar,
          s = a.rtlTranslate,
          r = i.$el,
          n = i.dragSize,
          o = i.trackSize;
        (t =
          ((a.isHorizontal()
            ? "touchstart" === e.type || "touchmove" === e.type
              ? e.targetTouches[0].pageX
              : e.pageX || e.clientX
            : "touchstart" === e.type || "touchmove" === e.type
              ? e.targetTouches[0].pageY
              : e.pageY || e.clientY) -
            r.offset()[a.isHorizontal() ? "left" : "top"] -
            n / 2) /
          (o - n)),
          (t = Math.max(Math.min(t, 1), 0)),
          s && (t = 1 - t);
        var l = a.minTranslate() + (a.maxTranslate() - a.minTranslate()) * t;
        a.updateProgress(l),
          a.setTranslate(l),
          a.updateActiveIndex(),
          a.updateSlidesClasses();
      },
      onDragStart: function (e) {
        var t = this,
          a = t.params.scrollbar,
          i = t.scrollbar,
          s = t.$wrapperEl,
          r = i.$el,
          n = i.$dragEl;
        (t.scrollbar.isTouched = !0),
          e.preventDefault(),
          e.stopPropagation(),
          s.transition(100),
          n.transition(100),
          i.setDragPosition(e),
          clearTimeout(t.scrollbar.dragTimeout),
          r.transition(0),
          a.hide && r.css("opacity", 1),
          t.emit("scrollbarDragStart", e);
      },
      onDragMove: function (e) {
        var t = this.scrollbar,
          a = this.$wrapperEl,
          i = t.$el,
          s = t.$dragEl;
        this.scrollbar.isTouched &&
          (e.preventDefault ? e.preventDefault() : (e.returnValue = !1),
          t.setDragPosition(e),
          a.transition(0),
          i.transition(0),
          s.transition(0),
          this.emit("scrollbarDragMove", e));
      },
      onDragEnd: function (e) {
        var t = this,
          a = t.params.scrollbar,
          i = t.scrollbar.$el;
        t.scrollbar.isTouched &&
          ((t.scrollbar.isTouched = !1),
          a.hide &&
            (clearTimeout(t.scrollbar.dragTimeout),
            (t.scrollbar.dragTimeout = X.nextTick(function () {
              i.css("opacity", 0), i.transition(400);
            }, 1e3))),
          t.emit("scrollbarDragEnd", e),
          a.snapOnRelease && t.slideToClosest());
      },
      enableDraggable: function () {
        var e = this;
        if (e.params.scrollbar.el) {
          var t = e.scrollbar,
            a = e.touchEvents,
            i = e.touchEventsDesktop,
            s = e.params,
            r = t.$el[0],
            n = !(!Y.passiveListener || !s.passiveListeners) && {
              passive: !1,
              capture: !1,
            },
            o = !(!Y.passiveListener || !s.passiveListeners) && {
              passive: !0,
              capture: !1,
            };
          Y.touch || (!Y.pointerEvents && !Y.prefixedPointerEvents)
            ? (Y.touch &&
                (r.addEventListener(a.start, e.scrollbar.onDragStart, n),
                r.addEventListener(a.move, e.scrollbar.onDragMove, n),
                r.addEventListener(a.end, e.scrollbar.onDragEnd, o)),
              ((s.simulateTouch && !m.ios && !m.android) ||
                (s.simulateTouch && !Y.touch && m.ios)) &&
                (r.addEventListener("mousedown", e.scrollbar.onDragStart, n),
                f.addEventListener("mousemove", e.scrollbar.onDragMove, n),
                f.addEventListener("mouseup", e.scrollbar.onDragEnd, o)))
            : (r.addEventListener(i.start, e.scrollbar.onDragStart, n),
              f.addEventListener(i.move, e.scrollbar.onDragMove, n),
              f.addEventListener(i.end, e.scrollbar.onDragEnd, o));
        }
      },
      disableDraggable: function () {
        var e = this;
        if (e.params.scrollbar.el) {
          var t = e.scrollbar,
            a = e.touchEvents,
            i = e.touchEventsDesktop,
            s = e.params,
            r = t.$el[0],
            n = !(!Y.passiveListener || !s.passiveListeners) && {
              passive: !1,
              capture: !1,
            },
            o = !(!Y.passiveListener || !s.passiveListeners) && {
              passive: !0,
              capture: !1,
            };
          Y.touch || (!Y.pointerEvents && !Y.prefixedPointerEvents)
            ? (Y.touch &&
                (r.removeEventListener(a.start, e.scrollbar.onDragStart, n),
                r.removeEventListener(a.move, e.scrollbar.onDragMove, n),
                r.removeEventListener(a.end, e.scrollbar.onDragEnd, o)),
              ((s.simulateTouch && !m.ios && !m.android) ||
                (s.simulateTouch && !Y.touch && m.ios)) &&
                (r.removeEventListener("mousedown", e.scrollbar.onDragStart, n),
                f.removeEventListener("mousemove", e.scrollbar.onDragMove, n),
                f.removeEventListener("mouseup", e.scrollbar.onDragEnd, o)))
            : (r.removeEventListener(i.start, e.scrollbar.onDragStart, n),
              f.removeEventListener(i.move, e.scrollbar.onDragMove, n),
              f.removeEventListener(i.end, e.scrollbar.onDragEnd, o));
        }
      },
      init: function () {
        var e = this;
        if (e.params.scrollbar.el) {
          var t = e.scrollbar,
            a = e.$el,
            i = e.params.scrollbar,
            s = L(i.el);
          e.params.uniqueNavElements &&
            "string" == typeof i.el &&
            1 < s.length &&
            1 === a.find(i.el).length &&
            (s = a.find(i.el));
          var r = s.find("." + e.params.scrollbar.dragClass);
          0 === r.length &&
            ((r = L(
              '<div class="' + e.params.scrollbar.dragClass + '"></div>'
            )),
            s.append(r)),
            X.extend(t, { $el: s, el: s[0], $dragEl: r, dragEl: r[0] }),
            i.draggable && t.enableDraggable();
        }
      },
      destroy: function () {
        this.scrollbar.disableDraggable();
      },
    },
    F = {
      setTransform: function (e, t) {
        var a = this.rtl,
          i = L(e),
          s = a ? -1 : 1,
          r = i.attr("data-swiper-parallax") || "0",
          n = i.attr("data-swiper-parallax-x"),
          o = i.attr("data-swiper-parallax-y"),
          l = i.attr("data-swiper-parallax-scale"),
          d = i.attr("data-swiper-parallax-opacity");
        if (
          (n || o
            ? ((n = n || "0"), (o = o || "0"))
            : this.isHorizontal()
              ? ((n = r), (o = "0"))
              : ((o = r), (n = "0")),
          (n =
            0 <= n.indexOf("%")
              ? parseInt(n, 10) * t * s + "%"
              : n * t * s + "px"),
          (o = 0 <= o.indexOf("%") ? parseInt(o, 10) * t + "%" : o * t + "px"),
          null != d)
        ) {
          var p = d - (d - 1) * (1 - Math.abs(t));
          i[0].style.opacity = p;
        }
        if (null == l) i.transform("translate3d(" + n + ", " + o + ", 0px)");
        else {
          var c = l - (l - 1) * (1 - Math.abs(t));
          i.transform(
            "translate3d(" + n + ", " + o + ", 0px) scale(" + c + ")"
          );
        }
      },
      setTranslate: function () {
        var i = this,
          e = i.$el,
          t = i.slides,
          s = i.progress,
          r = i.snapGrid;
        e
          .children(
            "[data-swiper-parallax], [data-swiper-parallax-x], [data-swiper-parallax-y]"
          )
          .each(function (e, t) {
            i.parallax.setTransform(t, s);
          }),
          t.each(function (e, t) {
            var a = t.progress;
            1 < i.params.slidesPerGroup &&
              "auto" !== i.params.slidesPerView &&
              (a += Math.ceil(e / 2) - s * (r.length - 1)),
              (a = Math.min(Math.max(a, -1), 1)),
              L(t)
                .find(
                  "[data-swiper-parallax], [data-swiper-parallax-x], [data-swiper-parallax-y]"
                )
                .each(function (e, t) {
                  i.parallax.setTransform(t, a);
                });
          });
      },
      setTransition: function (s) {
        void 0 === s && (s = this.params.speed);
        this.$el
          .find(
            "[data-swiper-parallax], [data-swiper-parallax-x], [data-swiper-parallax-y]"
          )
          .each(function (e, t) {
            var a = L(t),
              i = parseInt(a.attr("data-swiper-parallax-duration"), 10) || s;
            0 === s && (i = 0), a.transition(i);
          });
      },
    },
    W = {
      getDistanceBetweenTouches: function (e) {
        if (e.targetTouches.length < 2) return 1;
        var t = e.targetTouches[0].pageX,
          a = e.targetTouches[0].pageY,
          i = e.targetTouches[1].pageX,
          s = e.targetTouches[1].pageY;
        return Math.sqrt(Math.pow(i - t, 2) + Math.pow(s - a, 2));
      },
      onGestureStart: function (e) {
        var t = this,
          a = t.params.zoom,
          i = t.zoom,
          s = i.gesture;
        if (
          ((i.fakeGestureTouched = !1), (i.fakeGestureMoved = !1), !Y.gestures)
        ) {
          if (
            "touchstart" !== e.type ||
            ("touchstart" === e.type && e.targetTouches.length < 2)
          )
            return;
          (i.fakeGestureTouched = !0),
            (s.scaleStart = W.getDistanceBetweenTouches(e));
        }
        (s.$slideEl && s.$slideEl.length) ||
        ((s.$slideEl = L(e.target).closest(".swiper-slide")),
        0 === s.$slideEl.length && (s.$slideEl = t.slides.eq(t.activeIndex)),
        (s.$imageEl = s.$slideEl.find("img, svg, canvas")),
        (s.$imageWrapEl = s.$imageEl.parent("." + a.containerClass)),
        (s.maxRatio = s.$imageWrapEl.attr("data-swiper-zoom") || a.maxRatio),
        0 !== s.$imageWrapEl.length)
          ? (s.$imageEl.transition(0), (t.zoom.isScaling = !0))
          : (s.$imageEl = void 0);
      },
      onGestureChange: function (e) {
        var t = this.params.zoom,
          a = this.zoom,
          i = a.gesture;
        if (!Y.gestures) {
          if (
            "touchmove" !== e.type ||
            ("touchmove" === e.type && e.targetTouches.length < 2)
          )
            return;
          (a.fakeGestureMoved = !0),
            (i.scaleMove = W.getDistanceBetweenTouches(e));
        }
        i.$imageEl &&
          0 !== i.$imageEl.length &&
          (Y.gestures
            ? (this.zoom.scale = e.scale * a.currentScale)
            : (a.scale = (i.scaleMove / i.scaleStart) * a.currentScale),
          a.scale > i.maxRatio &&
            (a.scale =
              i.maxRatio - 1 + Math.pow(a.scale - i.maxRatio + 1, 0.5)),
          a.scale < t.minRatio &&
            (a.scale =
              t.minRatio + 1 - Math.pow(t.minRatio - a.scale + 1, 0.5)),
          i.$imageEl.transform("translate3d(0,0,0) scale(" + a.scale + ")"));
      },
      onGestureEnd: function (e) {
        var t = this.params.zoom,
          a = this.zoom,
          i = a.gesture;
        if (!Y.gestures) {
          if (!a.fakeGestureTouched || !a.fakeGestureMoved) return;
          if (
            "touchend" !== e.type ||
            ("touchend" === e.type && e.changedTouches.length < 2 && !m.android)
          )
            return;
          (a.fakeGestureTouched = !1), (a.fakeGestureMoved = !1);
        }
        i.$imageEl &&
          0 !== i.$imageEl.length &&
          ((a.scale = Math.max(Math.min(a.scale, i.maxRatio), t.minRatio)),
          i.$imageEl
            .transition(this.params.speed)
            .transform("translate3d(0,0,0) scale(" + a.scale + ")"),
          (a.currentScale = a.scale),
          (a.isScaling = !1),
          1 === a.scale && (i.$slideEl = void 0));
      },
      onTouchStart: function (e) {
        var t = this.zoom,
          a = t.gesture,
          i = t.image;
        a.$imageEl &&
          0 !== a.$imageEl.length &&
          (i.isTouched ||
            (m.android && e.preventDefault(),
            (i.isTouched = !0),
            (i.touchesStart.x =
              "touchstart" === e.type ? e.targetTouches[0].pageX : e.pageX),
            (i.touchesStart.y =
              "touchstart" === e.type ? e.targetTouches[0].pageY : e.pageY)));
      },
      onTouchMove: function (e) {
        var t = this,
          a = t.zoom,
          i = a.gesture,
          s = a.image,
          r = a.velocity;
        if (
          i.$imageEl &&
          0 !== i.$imageEl.length &&
          ((t.allowClick = !1), s.isTouched && i.$slideEl)
        ) {
          s.isMoved ||
            ((s.width = i.$imageEl[0].offsetWidth),
            (s.height = i.$imageEl[0].offsetHeight),
            (s.startX = X.getTranslate(i.$imageWrapEl[0], "x") || 0),
            (s.startY = X.getTranslate(i.$imageWrapEl[0], "y") || 0),
            (i.slideWidth = i.$slideEl[0].offsetWidth),
            (i.slideHeight = i.$slideEl[0].offsetHeight),
            i.$imageWrapEl.transition(0),
            t.rtl && ((s.startX = -s.startX), (s.startY = -s.startY)));
          var n = s.width * a.scale,
            o = s.height * a.scale;
          if (!(n < i.slideWidth && o < i.slideHeight)) {
            if (
              ((s.minX = Math.min(i.slideWidth / 2 - n / 2, 0)),
              (s.maxX = -s.minX),
              (s.minY = Math.min(i.slideHeight / 2 - o / 2, 0)),
              (s.maxY = -s.minY),
              (s.touchesCurrent.x =
                "touchmove" === e.type ? e.targetTouches[0].pageX : e.pageX),
              (s.touchesCurrent.y =
                "touchmove" === e.type ? e.targetTouches[0].pageY : e.pageY),
              !s.isMoved && !a.isScaling)
            ) {
              if (
                t.isHorizontal() &&
                ((Math.floor(s.minX) === Math.floor(s.startX) &&
                  s.touchesCurrent.x < s.touchesStart.x) ||
                  (Math.floor(s.maxX) === Math.floor(s.startX) &&
                    s.touchesCurrent.x > s.touchesStart.x))
              )
                return void (s.isTouched = !1);
              if (
                !t.isHorizontal() &&
                ((Math.floor(s.minY) === Math.floor(s.startY) &&
                  s.touchesCurrent.y < s.touchesStart.y) ||
                  (Math.floor(s.maxY) === Math.floor(s.startY) &&
                    s.touchesCurrent.y > s.touchesStart.y))
              )
                return void (s.isTouched = !1);
            }
            e.preventDefault(),
              e.stopPropagation(),
              (s.isMoved = !0),
              (s.currentX = s.touchesCurrent.x - s.touchesStart.x + s.startX),
              (s.currentY = s.touchesCurrent.y - s.touchesStart.y + s.startY),
              s.currentX < s.minX &&
                (s.currentX =
                  s.minX + 1 - Math.pow(s.minX - s.currentX + 1, 0.8)),
              s.currentX > s.maxX &&
                (s.currentX =
                  s.maxX - 1 + Math.pow(s.currentX - s.maxX + 1, 0.8)),
              s.currentY < s.minY &&
                (s.currentY =
                  s.minY + 1 - Math.pow(s.minY - s.currentY + 1, 0.8)),
              s.currentY > s.maxY &&
                (s.currentY =
                  s.maxY - 1 + Math.pow(s.currentY - s.maxY + 1, 0.8)),
              r.prevPositionX || (r.prevPositionX = s.touchesCurrent.x),
              r.prevPositionY || (r.prevPositionY = s.touchesCurrent.y),
              r.prevTime || (r.prevTime = Date.now()),
              (r.x =
                (s.touchesCurrent.x - r.prevPositionX) /
                (Date.now() - r.prevTime) /
                2),
              (r.y =
                (s.touchesCurrent.y - r.prevPositionY) /
                (Date.now() - r.prevTime) /
                2),
              Math.abs(s.touchesCurrent.x - r.prevPositionX) < 2 && (r.x = 0),
              Math.abs(s.touchesCurrent.y - r.prevPositionY) < 2 && (r.y = 0),
              (r.prevPositionX = s.touchesCurrent.x),
              (r.prevPositionY = s.touchesCurrent.y),
              (r.prevTime = Date.now()),
              i.$imageWrapEl.transform(
                "translate3d(" + s.currentX + "px, " + s.currentY + "px,0)"
              );
          }
        }
      },
      onTouchEnd: function () {
        var e = this.zoom,
          t = e.gesture,
          a = e.image,
          i = e.velocity;
        if (t.$imageEl && 0 !== t.$imageEl.length) {
          if (!a.isTouched || !a.isMoved)
            return (a.isTouched = !1), void (a.isMoved = !1);
          (a.isTouched = !1), (a.isMoved = !1);
          var s = 300,
            r = 300,
            n = i.x * s,
            o = a.currentX + n,
            l = i.y * r,
            d = a.currentY + l;
          0 !== i.x && (s = Math.abs((o - a.currentX) / i.x)),
            0 !== i.y && (r = Math.abs((d - a.currentY) / i.y));
          var p = Math.max(s, r);
          (a.currentX = o), (a.currentY = d);
          var c = a.width * e.scale,
            u = a.height * e.scale;
          (a.minX = Math.min(t.slideWidth / 2 - c / 2, 0)),
            (a.maxX = -a.minX),
            (a.minY = Math.min(t.slideHeight / 2 - u / 2, 0)),
            (a.maxY = -a.minY),
            (a.currentX = Math.max(Math.min(a.currentX, a.maxX), a.minX)),
            (a.currentY = Math.max(Math.min(a.currentY, a.maxY), a.minY)),
            t.$imageWrapEl
              .transition(p)
              .transform(
                "translate3d(" + a.currentX + "px, " + a.currentY + "px,0)"
              );
        }
      },
      onTransitionEnd: function () {
        var e = this.zoom,
          t = e.gesture;
        t.$slideEl &&
          this.previousIndex !== this.activeIndex &&
          (t.$imageEl.transform("translate3d(0,0,0) scale(1)"),
          t.$imageWrapEl.transform("translate3d(0,0,0)"),
          (t.$slideEl = void 0),
          (t.$imageEl = void 0),
          (t.$imageWrapEl = void 0),
          (e.scale = 1),
          (e.currentScale = 1));
      },
      toggle: function (e) {
        var t = this.zoom;
        t.scale && 1 !== t.scale ? t.out() : t.in(e);
      },
      in: function (e) {
        var t,
          a,
          i,
          s,
          r,
          n,
          o,
          l,
          d,
          p,
          c,
          u,
          h,
          v,
          f,
          m,
          g = this,
          b = g.zoom,
          w = g.params.zoom,
          y = b.gesture,
          x = b.image;
        (y.$slideEl ||
          ((y.$slideEl = g.clickedSlide
            ? L(g.clickedSlide)
            : g.slides.eq(g.activeIndex)),
          (y.$imageEl = y.$slideEl.find("img, svg, canvas")),
          (y.$imageWrapEl = y.$imageEl.parent("." + w.containerClass))),
        y.$imageEl && 0 !== y.$imageEl.length) &&
          (y.$slideEl.addClass("" + w.zoomedSlideClass),
          void 0 === x.touchesStart.x && e
            ? ((t =
                "touchend" === e.type ? e.changedTouches[0].pageX : e.pageX),
              (a = "touchend" === e.type ? e.changedTouches[0].pageY : e.pageY))
            : ((t = x.touchesStart.x), (a = x.touchesStart.y)),
          (b.scale = y.$imageWrapEl.attr("data-swiper-zoom") || w.maxRatio),
          (b.currentScale =
            y.$imageWrapEl.attr("data-swiper-zoom") || w.maxRatio),
          e
            ? ((f = y.$slideEl[0].offsetWidth),
              (m = y.$slideEl[0].offsetHeight),
              (i = y.$slideEl.offset().left + f / 2 - t),
              (s = y.$slideEl.offset().top + m / 2 - a),
              (o = y.$imageEl[0].offsetWidth),
              (l = y.$imageEl[0].offsetHeight),
              (d = o * b.scale),
              (p = l * b.scale),
              (h = -(c = Math.min(f / 2 - d / 2, 0))),
              (v = -(u = Math.min(m / 2 - p / 2, 0))),
              (r = i * b.scale) < c && (r = c),
              h < r && (r = h),
              (n = s * b.scale) < u && (n = u),
              v < n && (n = v))
            : (n = r = 0),
          y.$imageWrapEl
            .transition(300)
            .transform("translate3d(" + r + "px, " + n + "px,0)"),
          y.$imageEl
            .transition(300)
            .transform("translate3d(0,0,0) scale(" + b.scale + ")"));
      },
      out: function () {
        var e = this,
          t = e.zoom,
          a = e.params.zoom,
          i = t.gesture;
        i.$slideEl ||
          ((i.$slideEl = e.clickedSlide
            ? L(e.clickedSlide)
            : e.slides.eq(e.activeIndex)),
          (i.$imageEl = i.$slideEl.find("img, svg, canvas")),
          (i.$imageWrapEl = i.$imageEl.parent("." + a.containerClass))),
          i.$imageEl &&
            0 !== i.$imageEl.length &&
            ((t.scale = 1),
            (t.currentScale = 1),
            i.$imageWrapEl.transition(300).transform("translate3d(0,0,0)"),
            i.$imageEl.transition(300).transform("translate3d(0,0,0) scale(1)"),
            i.$slideEl.removeClass("" + a.zoomedSlideClass),
            (i.$slideEl = void 0));
      },
      enable: function () {
        var e = this,
          t = e.zoom;
        if (!t.enabled) {
          t.enabled = !0;
          var a = !(
            "touchstart" !== e.touchEvents.start ||
            !Y.passiveListener ||
            !e.params.passiveListeners
          ) && { passive: !0, capture: !1 };
          Y.gestures
            ? (e.$wrapperEl.on(
                "gesturestart",
                ".swiper-slide",
                t.onGestureStart,
                a
              ),
              e.$wrapperEl.on(
                "gesturechange",
                ".swiper-slide",
                t.onGestureChange,
                a
              ),
              e.$wrapperEl.on("gestureend", ".swiper-slide", t.onGestureEnd, a))
            : "touchstart" === e.touchEvents.start &&
              (e.$wrapperEl.on(
                e.touchEvents.start,
                ".swiper-slide",
                t.onGestureStart,
                a
              ),
              e.$wrapperEl.on(
                e.touchEvents.move,
                ".swiper-slide",
                t.onGestureChange,
                a
              ),
              e.$wrapperEl.on(
                e.touchEvents.end,
                ".swiper-slide",
                t.onGestureEnd,
                a
              )),
            e.$wrapperEl.on(
              e.touchEvents.move,
              "." + e.params.zoom.containerClass,
              t.onTouchMove
            );
        }
      },
      disable: function () {
        var e = this,
          t = e.zoom;
        if (t.enabled) {
          e.zoom.enabled = !1;
          var a = !(
            "touchstart" !== e.touchEvents.start ||
            !Y.passiveListener ||
            !e.params.passiveListeners
          ) && { passive: !0, capture: !1 };
          Y.gestures
            ? (e.$wrapperEl.off(
                "gesturestart",
                ".swiper-slide",
                t.onGestureStart,
                a
              ),
              e.$wrapperEl.off(
                "gesturechange",
                ".swiper-slide",
                t.onGestureChange,
                a
              ),
              e.$wrapperEl.off(
                "gestureend",
                ".swiper-slide",
                t.onGestureEnd,
                a
              ))
            : "touchstart" === e.touchEvents.start &&
              (e.$wrapperEl.off(
                e.touchEvents.start,
                ".swiper-slide",
                t.onGestureStart,
                a
              ),
              e.$wrapperEl.off(
                e.touchEvents.move,
                ".swiper-slide",
                t.onGestureChange,
                a
              ),
              e.$wrapperEl.off(
                e.touchEvents.end,
                ".swiper-slide",
                t.onGestureEnd,
                a
              )),
            e.$wrapperEl.off(
              e.touchEvents.move,
              "." + e.params.zoom.containerClass,
              t.onTouchMove
            );
        }
      },
    },
    q = {
      loadInSlide: function (e, l) {
        void 0 === l && (l = !0);
        var d = this,
          p = d.params.lazy;
        if (void 0 !== e && 0 !== d.slides.length) {
          var c =
              d.virtual && d.params.virtual.enabled
                ? d.$wrapperEl.children(
                    "." +
                      d.params.slideClass +
                      '[data-swiper-slide-index="' +
                      e +
                      '"]'
                  )
                : d.slides.eq(e),
            t = c.find(
              "." +
                p.elementClass +
                ":not(." +
                p.loadedClass +
                "):not(." +
                p.loadingClass +
                ")"
            );
          !c.hasClass(p.elementClass) ||
            c.hasClass(p.loadedClass) ||
            c.hasClass(p.loadingClass) ||
            (t = t.add(c[0])),
            0 !== t.length &&
              t.each(function (e, t) {
                var i = L(t);
                i.addClass(p.loadingClass);
                var s = i.attr("data-background"),
                  r = i.attr("data-src"),
                  n = i.attr("data-srcset"),
                  o = i.attr("data-sizes");
                d.loadImage(i[0], r || s, n, o, !1, function () {
                  if (null != d && d && (!d || d.params) && !d.destroyed) {
                    if (
                      (s
                        ? (i.css("background-image", 'url("' + s + '")'),
                          i.removeAttr("data-background"))
                        : (n &&
                            (i.attr("srcset", n), i.removeAttr("data-srcset")),
                          o && (i.attr("sizes", o), i.removeAttr("data-sizes")),
                          r && (i.attr("src", r), i.removeAttr("data-src"))),
                      i.addClass(p.loadedClass).removeClass(p.loadingClass),
                      c.find("." + p.preloaderClass).remove(),
                      d.params.loop && l)
                    ) {
                      var e = c.attr("data-swiper-slide-index");
                      if (c.hasClass(d.params.slideDuplicateClass)) {
                        var t = d.$wrapperEl.children(
                          '[data-swiper-slide-index="' +
                            e +
                            '"]:not(.' +
                            d.params.slideDuplicateClass +
                            ")"
                        );
                        d.lazy.loadInSlide(t.index(), !1);
                      } else {
                        var a = d.$wrapperEl.children(
                          "." +
                            d.params.slideDuplicateClass +
                            '[data-swiper-slide-index="' +
                            e +
                            '"]'
                        );
                        d.lazy.loadInSlide(a.index(), !1);
                      }
                    }
                    d.emit("lazyImageReady", c[0], i[0]);
                  }
                }),
                  d.emit("lazyImageLoad", c[0], i[0]);
              });
        }
      },
      load: function () {
        var i = this,
          t = i.$wrapperEl,
          a = i.params,
          s = i.slides,
          e = i.activeIndex,
          r = i.virtual && a.virtual.enabled,
          n = a.lazy,
          o = a.slidesPerView;
        function l(e) {
          if (r) {
            if (
              t.children(
                "." + a.slideClass + '[data-swiper-slide-index="' + e + '"]'
              ).length
            )
              return !0;
          } else if (s[e]) return !0;
          return !1;
        }
        function d(e) {
          return r ? L(e).attr("data-swiper-slide-index") : L(e).index();
        }
        if (
          ("auto" === o && (o = 0),
          i.lazy.initialImageLoaded || (i.lazy.initialImageLoaded = !0),
          i.params.watchSlidesVisibility)
        )
          t.children("." + a.slideVisibleClass).each(function (e, t) {
            var a = r ? L(t).attr("data-swiper-slide-index") : L(t).index();
            i.lazy.loadInSlide(a);
          });
        else if (1 < o)
          for (var p = e; p < e + o; p += 1) l(p) && i.lazy.loadInSlide(p);
        else i.lazy.loadInSlide(e);
        if (n.loadPrevNext)
          if (1 < o || (n.loadPrevNextAmount && 1 < n.loadPrevNextAmount)) {
            for (
              var c = n.loadPrevNextAmount,
                u = o,
                h = Math.min(e + u + Math.max(c, u), s.length),
                v = Math.max(e - Math.max(u, c), 0),
                f = e + o;
              f < h;
              f += 1
            )
              l(f) && i.lazy.loadInSlide(f);
            for (var m = v; m < e; m += 1) l(m) && i.lazy.loadInSlide(m);
          } else {
            var g = t.children("." + a.slideNextClass);
            0 < g.length && i.lazy.loadInSlide(d(g));
            var b = t.children("." + a.slidePrevClass);
            0 < b.length && i.lazy.loadInSlide(d(b));
          }
      },
    },
    j = {
      LinearSpline: function (e, t) {
        var a,
          i,
          s,
          r,
          n,
          o = function (e, t) {
            for (i = -1, a = e.length; 1 < a - i; )
              e[(s = (a + i) >> 1)] <= t ? (i = s) : (a = s);
            return a;
          };
        return (
          (this.x = e),
          (this.y = t),
          (this.lastIndex = e.length - 1),
          (this.interpolate = function (e) {
            return e
              ? ((n = o(this.x, e)),
                (r = n - 1),
                ((e - this.x[r]) * (this.y[n] - this.y[r])) /
                  (this.x[n] - this.x[r]) +
                  this.y[r])
              : 0;
          }),
          this
        );
      },
      getInterpolateFunction: function (e) {
        var t = this;
        t.controller.spline ||
          (t.controller.spline = t.params.loop
            ? new j.LinearSpline(t.slidesGrid, e.slidesGrid)
            : new j.LinearSpline(t.snapGrid, e.snapGrid));
      },
      setTranslate: function (e, t) {
        var a,
          i,
          s = this,
          r = s.controller.control;
        function n(e) {
          var t = s.rtlTranslate ? -s.translate : s.translate;
          "slide" === s.params.controller.by &&
            (s.controller.getInterpolateFunction(e),
            (i = -s.controller.spline.interpolate(-t))),
            (i && "container" !== s.params.controller.by) ||
              ((a =
                (e.maxTranslate() - e.minTranslate()) /
                (s.maxTranslate() - s.minTranslate())),
              (i = (t - s.minTranslate()) * a + e.minTranslate())),
            s.params.controller.inverse && (i = e.maxTranslate() - i),
            e.updateProgress(i),
            e.setTranslate(i, s),
            e.updateActiveIndex(),
            e.updateSlidesClasses();
        }
        if (Array.isArray(r))
          for (var o = 0; o < r.length; o += 1)
            r[o] !== t && r[o] instanceof S && n(r[o]);
        else r instanceof S && t !== r && n(r);
      },
      setTransition: function (t, e) {
        var a,
          i = this,
          s = i.controller.control;
        function r(e) {
          e.setTransition(t, i),
            0 !== t &&
              (e.transitionStart(),
              e.params.autoHeight &&
                X.nextTick(function () {
                  e.updateAutoHeight();
                }),
              e.$wrapperEl.transitionEnd(function () {
                s &&
                  (e.params.loop &&
                    "slide" === i.params.controller.by &&
                    e.loopFix(),
                  e.transitionEnd());
              }));
        }
        if (Array.isArray(s))
          for (a = 0; a < s.length; a += 1)
            s[a] !== e && s[a] instanceof S && r(s[a]);
        else s instanceof S && e !== s && r(s);
      },
    },
    K = {
      makeElFocusable: function (e) {
        return e.attr("tabIndex", "0"), e;
      },
      addElRole: function (e, t) {
        return e.attr("role", t), e;
      },
      addElLabel: function (e, t) {
        return e.attr("aria-label", t), e;
      },
      disableEl: function (e) {
        return e.attr("aria-disabled", !0), e;
      },
      enableEl: function (e) {
        return e.attr("aria-disabled", !1), e;
      },
      onEnterKey: function (e) {
        var t = this,
          a = t.params.a11y;
        if (13 === e.keyCode) {
          var i = L(e.target);
          t.navigation &&
            t.navigation.$nextEl &&
            i.is(t.navigation.$nextEl) &&
            ((t.isEnd && !t.params.loop) || t.slideNext(),
            t.isEnd
              ? t.a11y.notify(a.lastSlideMessage)
              : t.a11y.notify(a.nextSlideMessage)),
            t.navigation &&
              t.navigation.$prevEl &&
              i.is(t.navigation.$prevEl) &&
              ((t.isBeginning && !t.params.loop) || t.slidePrev(),
              t.isBeginning
                ? t.a11y.notify(a.firstSlideMessage)
                : t.a11y.notify(a.prevSlideMessage)),
            t.pagination &&
              i.is("." + t.params.pagination.bulletClass) &&
              i[0].click();
        }
      },
      notify: function (e) {
        var t = this.a11y.liveRegion;
        0 !== t.length && (t.html(""), t.html(e));
      },
      updateNavigation: function () {
        var e = this;
        if (!e.params.loop) {
          var t = e.navigation,
            a = t.$nextEl,
            i = t.$prevEl;
          i &&
            0 < i.length &&
            (e.isBeginning ? e.a11y.disableEl(i) : e.a11y.enableEl(i)),
            a &&
              0 < a.length &&
              (e.isEnd ? e.a11y.disableEl(a) : e.a11y.enableEl(a));
        }
      },
      updatePagination: function () {
        var i = this,
          s = i.params.a11y;
        i.pagination &&
          i.params.pagination.clickable &&
          i.pagination.bullets &&
          i.pagination.bullets.length &&
          i.pagination.bullets.each(function (e, t) {
            var a = L(t);
            i.a11y.makeElFocusable(a),
              i.a11y.addElRole(a, "button"),
              i.a11y.addElLabel(
                a,
                s.paginationBulletMessage.replace(/{{index}}/, a.index() + 1)
              );
          });
      },
      init: function () {
        var e = this;
        e.$el.append(e.a11y.liveRegion);
        var t,
          a,
          i = e.params.a11y;
        e.navigation && e.navigation.$nextEl && (t = e.navigation.$nextEl),
          e.navigation && e.navigation.$prevEl && (a = e.navigation.$prevEl),
          t &&
            (e.a11y.makeElFocusable(t),
            e.a11y.addElRole(t, "button"),
            e.a11y.addElLabel(t, i.nextSlideMessage),
            t.on("keydown", e.a11y.onEnterKey)),
          a &&
            (e.a11y.makeElFocusable(a),
            e.a11y.addElRole(a, "button"),
            e.a11y.addElLabel(a, i.prevSlideMessage),
            a.on("keydown", e.a11y.onEnterKey)),
          e.pagination &&
            e.params.pagination.clickable &&
            e.pagination.bullets &&
            e.pagination.bullets.length &&
            e.pagination.$el.on(
              "keydown",
              "." + e.params.pagination.bulletClass,
              e.a11y.onEnterKey
            );
      },
      destroy: function () {
        var e,
          t,
          a = this;
        a.a11y.liveRegion &&
          0 < a.a11y.liveRegion.length &&
          a.a11y.liveRegion.remove(),
          a.navigation && a.navigation.$nextEl && (e = a.navigation.$nextEl),
          a.navigation && a.navigation.$prevEl && (t = a.navigation.$prevEl),
          e && e.off("keydown", a.a11y.onEnterKey),
          t && t.off("keydown", a.a11y.onEnterKey),
          a.pagination &&
            a.params.pagination.clickable &&
            a.pagination.bullets &&
            a.pagination.bullets.length &&
            a.pagination.$el.off(
              "keydown",
              "." + a.params.pagination.bulletClass,
              a.a11y.onEnterKey
            );
      },
    },
    U = {
      init: function () {
        var e = this;
        if (e.params.history) {
          if (!B.history || !B.history.pushState)
            return (
              (e.params.history.enabled = !1),
              void (e.params.hashNavigation.enabled = !0)
            );
          var t = e.history;
          (t.initialized = !0),
            (t.paths = U.getPathValues()),
            (t.paths.key || t.paths.value) &&
              (t.scrollToSlide(0, t.paths.value, e.params.runCallbacksOnInit),
              e.params.history.replaceState ||
                B.addEventListener("popstate", e.history.setHistoryPopState));
        }
      },
      destroy: function () {
        this.params.history.replaceState ||
          B.removeEventListener("popstate", this.history.setHistoryPopState);
      },
      setHistoryPopState: function () {
        (this.history.paths = U.getPathValues()),
          this.history.scrollToSlide(
            this.params.speed,
            this.history.paths.value,
            !1
          );
      },
      getPathValues: function () {
        var e = B.location.pathname
            .slice(1)
            .split("/")
            .filter(function (e) {
              return "" !== e;
            }),
          t = e.length;
        return { key: e[t - 2], value: e[t - 1] };
      },
      setHistory: function (e, t) {
        if (this.history.initialized && this.params.history.enabled) {
          var a = this.slides.eq(t),
            i = U.slugify(a.attr("data-history"));
          B.location.pathname.includes(e) || (i = e + "/" + i);
          var s = B.history.state;
          (s && s.value === i) ||
            (this.params.history.replaceState
              ? B.history.replaceState({ value: i }, null, i)
              : B.history.pushState({ value: i }, null, i));
        }
      },
      slugify: function (e) {
        return e
          .toString()
          .toLowerCase()
          .replace(/\s+/g, "-")
          .replace(/[^\w-]+/g, "")
          .replace(/--+/g, "-")
          .replace(/^-+/, "")
          .replace(/-+$/, "");
      },
      scrollToSlide: function (e, t, a) {
        var i = this;
        if (t)
          for (var s = 0, r = i.slides.length; s < r; s += 1) {
            var n = i.slides.eq(s);
            if (
              U.slugify(n.attr("data-history")) === t &&
              !n.hasClass(i.params.slideDuplicateClass)
            ) {
              var o = n.index();
              i.slideTo(o, e, a);
            }
          }
        else i.slideTo(0, e, a);
      },
    },
    _ = {
      onHashCange: function () {
        var e = this,
          t = f.location.hash.replace("#", "");
        t !== e.slides.eq(e.activeIndex).attr("data-hash") &&
          e.slideTo(
            e.$wrapperEl
              .children("." + e.params.slideClass + '[data-hash="' + t + '"]')
              .index()
          );
      },
      setHash: function () {
        var e = this;
        if (e.hashNavigation.initialized && e.params.hashNavigation.enabled)
          if (
            e.params.hashNavigation.replaceState &&
            B.history &&
            B.history.replaceState
          )
            B.history.replaceState(
              null,
              null,
              "#" + e.slides.eq(e.activeIndex).attr("data-hash") || ""
            );
          else {
            var t = e.slides.eq(e.activeIndex),
              a = t.attr("data-hash") || t.attr("data-history");
            f.location.hash = a || "";
          }
      },
      init: function () {
        var e = this;
        if (
          !(
            !e.params.hashNavigation.enabled ||
            (e.params.history && e.params.history.enabled)
          )
        ) {
          e.hashNavigation.initialized = !0;
          var t = f.location.hash.replace("#", "");
          if (t)
            for (var a = 0, i = e.slides.length; a < i; a += 1) {
              var s = e.slides.eq(a);
              if (
                (s.attr("data-hash") || s.attr("data-history")) === t &&
                !s.hasClass(e.params.slideDuplicateClass)
              ) {
                var r = s.index();
                e.slideTo(r, 0, e.params.runCallbacksOnInit, !0);
              }
            }
          e.params.hashNavigation.watchState &&
            L(B).on("hashchange", e.hashNavigation.onHashCange);
        }
      },
      destroy: function () {
        this.params.hashNavigation.watchState &&
          L(B).off("hashchange", this.hashNavigation.onHashCange);
      },
    },
    Z = {
      run: function () {
        var e = this,
          t = e.slides.eq(e.activeIndex),
          a = e.params.autoplay.delay;
        t.attr("data-swiper-autoplay") &&
          (a = t.attr("data-swiper-autoplay") || e.params.autoplay.delay),
          (e.autoplay.timeout = X.nextTick(function () {
            e.params.autoplay.reverseDirection
              ? e.params.loop
                ? (e.loopFix(),
                  e.slidePrev(e.params.speed, !0, !0),
                  e.emit("autoplay"))
                : e.isBeginning
                  ? e.params.autoplay.stopOnLastSlide
                    ? e.autoplay.stop()
                    : (e.slideTo(e.slides.length - 1, e.params.speed, !0, !0),
                      e.emit("autoplay"))
                  : (e.slidePrev(e.params.speed, !0, !0), e.emit("autoplay"))
              : e.params.loop
                ? (e.loopFix(),
                  e.slideNext(e.params.speed, !0, !0),
                  e.emit("autoplay"))
                : e.isEnd
                  ? e.params.autoplay.stopOnLastSlide
                    ? e.autoplay.stop()
                    : (e.slideTo(0, e.params.speed, !0, !0), e.emit("autoplay"))
                  : (e.slideNext(e.params.speed, !0, !0), e.emit("autoplay"));
          }, a));
      },
      start: function () {
        var e = this;
        return (
          void 0 === e.autoplay.timeout &&
          !e.autoplay.running &&
          ((e.autoplay.running = !0),
          e.emit("autoplayStart"),
          e.autoplay.run(),
          !0)
        );
      },
      stop: function () {
        var e = this;
        return (
          !!e.autoplay.running &&
          void 0 !== e.autoplay.timeout &&
          (e.autoplay.timeout &&
            (clearTimeout(e.autoplay.timeout), (e.autoplay.timeout = void 0)),
          (e.autoplay.running = !1),
          e.emit("autoplayStop"),
          !0)
        );
      },
      pause: function (e) {
        var t = this;
        t.autoplay.running &&
          (t.autoplay.paused ||
            (t.autoplay.timeout && clearTimeout(t.autoplay.timeout),
            (t.autoplay.paused = !0),
            0 !== e && t.params.autoplay.waitForTransition
              ? (t.$wrapperEl[0].addEventListener(
                  "transitionend",
                  t.autoplay.onTransitionEnd
                ),
                t.$wrapperEl[0].addEventListener(
                  "webkitTransitionEnd",
                  t.autoplay.onTransitionEnd
                ))
              : ((t.autoplay.paused = !1), t.autoplay.run())));
      },
    },
    Q = {
      setTranslate: function () {
        for (var e = this, t = e.slides, a = 0; a < t.length; a += 1) {
          var i = e.slides.eq(a),
            s = -i[0].swiperSlideOffset;
          e.params.virtualTranslate || (s -= e.translate);
          var r = 0;
          e.isHorizontal() || ((r = s), (s = 0));
          var n = e.params.fadeEffect.crossFade
            ? Math.max(1 - Math.abs(i[0].progress), 0)
            : 1 + Math.min(Math.max(i[0].progress, -1), 0);
          i.css({ opacity: n }).transform(
            "translate3d(" + s + "px, " + r + "px, 0px)"
          );
        }
      },
      setTransition: function (e) {
        var a = this,
          t = a.slides,
          i = a.$wrapperEl;
        if ((t.transition(e), a.params.virtualTranslate && 0 !== e)) {
          var s = !1;
          t.transitionEnd(function () {
            if (!s && a && !a.destroyed) {
              (s = !0), (a.animating = !1);
              for (
                var e = ["webkitTransitionEnd", "transitionend"], t = 0;
                t < e.length;
                t += 1
              )
                i.trigger(e[t]);
            }
          });
        }
      },
    },
    J = {
      setTranslate: function () {
        var e,
          t = this,
          a = t.$el,
          i = t.$wrapperEl,
          s = t.slides,
          r = t.width,
          n = t.height,
          o = t.rtlTranslate,
          l = t.size,
          d = t.params.cubeEffect,
          p = t.isHorizontal(),
          c = t.virtual && t.params.virtual.enabled,
          u = 0;
        d.shadow &&
          (p
            ? (0 === (e = i.find(".swiper-cube-shadow")).length &&
                ((e = L('<div class="swiper-cube-shadow"></div>')),
                i.append(e)),
              e.css({ height: r + "px" }))
            : 0 === (e = a.find(".swiper-cube-shadow")).length &&
              ((e = L('<div class="swiper-cube-shadow"></div>')), a.append(e)));
        for (var h = 0; h < s.length; h += 1) {
          var v = s.eq(h),
            f = h;
          c && (f = parseInt(v.attr("data-swiper-slide-index"), 10));
          var m = 90 * f,
            g = Math.floor(m / 360);
          o && ((m = -m), (g = Math.floor(-m / 360)));
          var b = Math.max(Math.min(v[0].progress, 1), -1),
            w = 0,
            y = 0,
            x = 0;
          f % 4 == 0
            ? ((w = 4 * -g * l), (x = 0))
            : (f - 1) % 4 == 0
              ? ((w = 0), (x = 4 * -g * l))
              : (f - 2) % 4 == 0
                ? ((w = l + 4 * g * l), (x = l))
                : (f - 3) % 4 == 0 && ((w = -l), (x = 3 * l + 4 * l * g)),
            o && (w = -w),
            p || ((y = w), (w = 0));
          var E =
            "rotateX(" +
            (p ? 0 : -m) +
            "deg) rotateY(" +
            (p ? m : 0) +
            "deg) translate3d(" +
            w +
            "px, " +
            y +
            "px, " +
            x +
            "px)";
          if (
            (b <= 1 &&
              -1 < b &&
              ((u = 90 * f + 90 * b), o && (u = 90 * -f - 90 * b)),
            v.transform(E),
            d.slideShadows)
          ) {
            var T = p
                ? v.find(".swiper-slide-shadow-left")
                : v.find(".swiper-slide-shadow-top"),
              S = p
                ? v.find(".swiper-slide-shadow-right")
                : v.find(".swiper-slide-shadow-bottom");
            0 === T.length &&
              ((T = L(
                '<div class="swiper-slide-shadow-' +
                  (p ? "left" : "top") +
                  '"></div>'
              )),
              v.append(T)),
              0 === S.length &&
                ((S = L(
                  '<div class="swiper-slide-shadow-' +
                    (p ? "right" : "bottom") +
                    '"></div>'
                )),
                v.append(S)),
              T.length && (T[0].style.opacity = Math.max(-b, 0)),
              S.length && (S[0].style.opacity = Math.max(b, 0));
          }
        }
        if (
          (i.css({
            "-webkit-transform-origin": "50% 50% -" + l / 2 + "px",
            "-moz-transform-origin": "50% 50% -" + l / 2 + "px",
            "-ms-transform-origin": "50% 50% -" + l / 2 + "px",
            "transform-origin": "50% 50% -" + l / 2 + "px",
          }),
          d.shadow)
        )
          if (p)
            e.transform(
              "translate3d(0px, " +
                (r / 2 + d.shadowOffset) +
                "px, " +
                -r / 2 +
                "px) rotateX(90deg) rotateZ(0deg) scale(" +
                d.shadowScale +
                ")"
            );
          else {
            var C = Math.abs(u) - 90 * Math.floor(Math.abs(u) / 90),
              M =
                1.5 -
                (Math.sin((2 * C * Math.PI) / 360) / 2 +
                  Math.cos((2 * C * Math.PI) / 360) / 2),
              z = d.shadowScale,
              k = d.shadowScale / M,
              P = d.shadowOffset;
            e.transform(
              "scale3d(" +
                z +
                ", 1, " +
                k +
                ") translate3d(0px, " +
                (n / 2 + P) +
                "px, " +
                -n / 2 / k +
                "px) rotateX(-90deg)"
            );
          }
        var $ = I.isSafari || I.isUiWebView ? -l / 2 : 0;
        i.transform(
          "translate3d(0px,0," +
            $ +
            "px) rotateX(" +
            (t.isHorizontal() ? 0 : u) +
            "deg) rotateY(" +
            (t.isHorizontal() ? -u : 0) +
            "deg)"
        );
      },
      setTransition: function (e) {
        var t = this.$el;
        this.slides
          .transition(e)
          .find(
            ".swiper-slide-shadow-top, .swiper-slide-shadow-right, .swiper-slide-shadow-bottom, .swiper-slide-shadow-left"
          )
          .transition(e),
          this.params.cubeEffect.shadow &&
            !this.isHorizontal() &&
            t.find(".swiper-cube-shadow").transition(e);
      },
    },
    ee = {
      setTranslate: function () {
        for (
          var e = this, t = e.slides, a = e.rtlTranslate, i = 0;
          i < t.length;
          i += 1
        ) {
          var s = t.eq(i),
            r = s[0].progress;
          e.params.flipEffect.limitRotation &&
            (r = Math.max(Math.min(s[0].progress, 1), -1));
          var n = -180 * r,
            o = 0,
            l = -s[0].swiperSlideOffset,
            d = 0;
          if (
            (e.isHorizontal()
              ? a && (n = -n)
              : ((d = l), (o = -n), (n = l = 0)),
            (s[0].style.zIndex = -Math.abs(Math.round(r)) + t.length),
            e.params.flipEffect.slideShadows)
          ) {
            var p = e.isHorizontal()
                ? s.find(".swiper-slide-shadow-left")
                : s.find(".swiper-slide-shadow-top"),
              c = e.isHorizontal()
                ? s.find(".swiper-slide-shadow-right")
                : s.find(".swiper-slide-shadow-bottom");
            0 === p.length &&
              ((p = L(
                '<div class="swiper-slide-shadow-' +
                  (e.isHorizontal() ? "left" : "top") +
                  '"></div>'
              )),
              s.append(p)),
              0 === c.length &&
                ((c = L(
                  '<div class="swiper-slide-shadow-' +
                    (e.isHorizontal() ? "right" : "bottom") +
                    '"></div>'
                )),
                s.append(c)),
              p.length && (p[0].style.opacity = Math.max(-r, 0)),
              c.length && (c[0].style.opacity = Math.max(r, 0));
          }
          s.transform(
            "translate3d(" +
              l +
              "px, " +
              d +
              "px, 0px) rotateX(" +
              o +
              "deg) rotateY(" +
              n +
              "deg)"
          );
        }
      },
      setTransition: function (e) {
        var a = this,
          t = a.slides,
          i = a.activeIndex,
          s = a.$wrapperEl;
        if (
          (t
            .transition(e)
            .find(
              ".swiper-slide-shadow-top, .swiper-slide-shadow-right, .swiper-slide-shadow-bottom, .swiper-slide-shadow-left"
            )
            .transition(e),
          a.params.virtualTranslate && 0 !== e)
        ) {
          var r = !1;
          t.eq(i).transitionEnd(function () {
            if (!r && a && !a.destroyed) {
              (r = !0), (a.animating = !1);
              for (
                var e = ["webkitTransitionEnd", "transitionend"], t = 0;
                t < e.length;
                t += 1
              )
                s.trigger(e[t]);
            }
          });
        }
      },
    },
    te = {
      setTranslate: function () {
        for (
          var e = this,
            t = e.width,
            a = e.height,
            i = e.slides,
            s = e.$wrapperEl,
            r = e.slidesSizesGrid,
            n = e.params.coverflowEffect,
            o = e.isHorizontal(),
            l = e.translate,
            d = o ? t / 2 - l : a / 2 - l,
            p = o ? n.rotate : -n.rotate,
            c = n.depth,
            u = 0,
            h = i.length;
          u < h;
          u += 1
        ) {
          var v = i.eq(u),
            f = r[u],
            m = ((d - v[0].swiperSlideOffset - f / 2) / f) * n.modifier,
            g = o ? p * m : 0,
            b = o ? 0 : p * m,
            w = -c * Math.abs(m),
            y = o ? 0 : n.stretch * m,
            x = o ? n.stretch * m : 0;
          Math.abs(x) < 0.001 && (x = 0),
            Math.abs(y) < 0.001 && (y = 0),
            Math.abs(w) < 0.001 && (w = 0),
            Math.abs(g) < 0.001 && (g = 0),
            Math.abs(b) < 0.001 && (b = 0);
          var E =
            "translate3d(" +
            x +
            "px," +
            y +
            "px," +
            w +
            "px)  rotateX(" +
            b +
            "deg) rotateY(" +
            g +
            "deg)";
          if (
            (v.transform(E),
            (v[0].style.zIndex = 1 - Math.abs(Math.round(m))),
            n.slideShadows)
          ) {
            var T = o
                ? v.find(".swiper-slide-shadow-left")
                : v.find(".swiper-slide-shadow-top"),
              S = o
                ? v.find(".swiper-slide-shadow-right")
                : v.find(".swiper-slide-shadow-bottom");
            0 === T.length &&
              ((T = L(
                '<div class="swiper-slide-shadow-' +
                  (o ? "left" : "top") +
                  '"></div>'
              )),
              v.append(T)),
              0 === S.length &&
                ((S = L(
                  '<div class="swiper-slide-shadow-' +
                    (o ? "right" : "bottom") +
                    '"></div>'
                )),
                v.append(S)),
              T.length && (T[0].style.opacity = 0 < m ? m : 0),
              S.length && (S[0].style.opacity = 0 < -m ? -m : 0);
          }
        }
        (Y.pointerEvents || Y.prefixedPointerEvents) &&
          (s[0].style.perspectiveOrigin = d + "px 50%");
      },
      setTransition: function (e) {
        this.slides
          .transition(e)
          .find(
            ".swiper-slide-shadow-top, .swiper-slide-shadow-right, .swiper-slide-shadow-bottom, .swiper-slide-shadow-left"
          )
          .transition(e);
      },
    },
    ae = [
      C,
      M,
      z,
      k,
      $,
      O,
      H,
      {
        name: "mousewheel",
        params: {
          mousewheel: {
            enabled: !1,
            releaseOnEdges: !1,
            invert: !1,
            forceToAxis: !1,
            sensitivity: 1,
            eventsTarged: "container",
          },
        },
        create: function () {
          var e = this;
          X.extend(e, {
            mousewheel: {
              enabled: !1,
              enable: G.enable.bind(e),
              disable: G.disable.bind(e),
              handle: G.handle.bind(e),
              handleMouseEnter: G.handleMouseEnter.bind(e),
              handleMouseLeave: G.handleMouseLeave.bind(e),
              lastScrollTime: X.now(),
            },
          });
        },
        on: {
          init: function () {
            this.params.mousewheel.enabled && this.mousewheel.enable();
          },
          destroy: function () {
            this.mousewheel.enabled && this.mousewheel.disable();
          },
        },
      },
      {
        name: "navigation",
        params: {
          navigation: {
            nextEl: null,
            prevEl: null,
            hideOnClick: !1,
            disabledClass: "swiper-button-disabled",
            hiddenClass: "swiper-button-hidden",
            lockClass: "swiper-button-lock",
          },
        },
        create: function () {
          X.extend(this, {
            navigation: {
              init: N.init.bind(this),
              update: N.update.bind(this),
              destroy: N.destroy.bind(this),
            },
          });
        },
        on: {
          init: function () {
            this.navigation.init(), this.navigation.update();
          },
          toEdge: function () {
            this.navigation.update();
          },
          fromEdge: function () {
            this.navigation.update();
          },
          destroy: function () {
            this.navigation.destroy();
          },
          click: function (e) {
            var t = this.navigation,
              a = t.$nextEl,
              i = t.$prevEl;
            !this.params.navigation.hideOnClick ||
              L(e.target).is(i) ||
              L(e.target).is(a) ||
              (a && a.toggleClass(this.params.navigation.hiddenClass),
              i && i.toggleClass(this.params.navigation.hiddenClass));
          },
        },
      },
      {
        name: "pagination",
        params: {
          pagination: {
            el: null,
            bulletElement: "span",
            clickable: !1,
            hideOnClick: !1,
            renderBullet: null,
            renderProgressbar: null,
            renderFraction: null,
            renderCustom: null,
            progressbarOpposite: !1,
            type: "bullets",
            dynamicBullets: !1,
            dynamicMainBullets: 1,
            formatFractionCurrent: function (e) {
              return e;
            },
            formatFractionTotal: function (e) {
              return e;
            },
            bulletClass: "swiper-pagination-bullet",
            bulletActiveClass: "swiper-pagination-bullet-active",
            modifierClass: "swiper-pagination-",
            currentClass: "swiper-pagination-current",
            totalClass: "swiper-pagination-total",
            hiddenClass: "swiper-pagination-hidden",
            progressbarFillClass: "swiper-pagination-progressbar-fill",
            progressbarOppositeClass: "swiper-pagination-progressbar-opposite",
            clickableClass: "swiper-pagination-clickable",
            lockClass: "swiper-pagination-lock",
          },
        },
        create: function () {
          var e = this;
          X.extend(e, {
            pagination: {
              init: V.init.bind(e),
              render: V.render.bind(e),
              update: V.update.bind(e),
              destroy: V.destroy.bind(e),
              dynamicBulletIndex: 0,
            },
          });
        },
        on: {
          init: function () {
            this.pagination.init(),
              this.pagination.render(),
              this.pagination.update();
          },
          activeIndexChange: function () {
            this.params.loop
              ? this.pagination.update()
              : void 0 === this.snapIndex && this.pagination.update();
          },
          snapIndexChange: function () {
            this.params.loop || this.pagination.update();
          },
          slidesLengthChange: function () {
            this.params.loop &&
              (this.pagination.render(), this.pagination.update());
          },
          snapGridLengthChange: function () {
            this.params.loop ||
              (this.pagination.render(), this.pagination.update());
          },
          destroy: function () {
            this.pagination.destroy();
          },
          click: function (e) {
            var t = this;
            t.params.pagination.el &&
              t.params.pagination.hideOnClick &&
              0 < t.pagination.$el.length &&
              !L(e.target).hasClass(t.params.pagination.bulletClass) &&
              t.pagination.$el.toggleClass(t.params.pagination.hiddenClass);
          },
        },
      },
      {
        name: "scrollbar",
        params: {
          scrollbar: {
            el: null,
            dragSize: "auto",
            hide: !1,
            draggable: !1,
            snapOnRelease: !0,
            lockClass: "swiper-scrollbar-lock",
            dragClass: "swiper-scrollbar-drag",
          },
        },
        create: function () {
          var e = this;
          X.extend(e, {
            scrollbar: {
              init: R.init.bind(e),
              destroy: R.destroy.bind(e),
              updateSize: R.updateSize.bind(e),
              setTranslate: R.setTranslate.bind(e),
              setTransition: R.setTransition.bind(e),
              enableDraggable: R.enableDraggable.bind(e),
              disableDraggable: R.disableDraggable.bind(e),
              setDragPosition: R.setDragPosition.bind(e),
              onDragStart: R.onDragStart.bind(e),
              onDragMove: R.onDragMove.bind(e),
              onDragEnd: R.onDragEnd.bind(e),
              isTouched: !1,
              timeout: null,
              dragTimeout: null,
            },
          });
        },
        on: {
          init: function () {
            this.scrollbar.init(),
              this.scrollbar.updateSize(),
              this.scrollbar.setTranslate();
          },
          update: function () {
            this.scrollbar.updateSize();
          },
          resize: function () {
            this.scrollbar.updateSize();
          },
          observerUpdate: function () {
            this.scrollbar.updateSize();
          },
          setTranslate: function () {
            this.scrollbar.setTranslate();
          },
          setTransition: function (e) {
            this.scrollbar.setTransition(e);
          },
          destroy: function () {
            this.scrollbar.destroy();
          },
        },
      },
      {
        name: "parallax",
        params: { parallax: { enabled: !1 } },
        create: function () {
          X.extend(this, {
            parallax: {
              setTransform: F.setTransform.bind(this),
              setTranslate: F.setTranslate.bind(this),
              setTransition: F.setTransition.bind(this),
            },
          });
        },
        on: {
          beforeInit: function () {
            this.params.parallax.enabled &&
              (this.params.watchSlidesProgress = !0);
          },
          init: function () {
            this.params.parallax && this.parallax.setTranslate();
          },
          setTranslate: function () {
            this.params.parallax && this.parallax.setTranslate();
          },
          setTransition: function (e) {
            this.params.parallax && this.parallax.setTransition(e);
          },
        },
      },
      {
        name: "zoom",
        params: {
          zoom: {
            enabled: !1,
            maxRatio: 3,
            minRatio: 1,
            toggle: !0,
            containerClass: "swiper-zoom-container",
            zoomedSlideClass: "swiper-slide-zoomed",
          },
        },
        create: function () {
          var t = this,
            a = {
              enabled: !1,
              scale: 1,
              currentScale: 1,
              isScaling: !1,
              gesture: {
                $slideEl: void 0,
                slideWidth: void 0,
                slideHeight: void 0,
                $imageEl: void 0,
                $imageWrapEl: void 0,
                maxRatio: 3,
              },
              image: {
                isTouched: void 0,
                isMoved: void 0,
                currentX: void 0,
                currentY: void 0,
                minX: void 0,
                minY: void 0,
                maxX: void 0,
                maxY: void 0,
                width: void 0,
                height: void 0,
                startX: void 0,
                startY: void 0,
                touchesStart: {},
                touchesCurrent: {},
              },
              velocity: {
                x: void 0,
                y: void 0,
                prevPositionX: void 0,
                prevPositionY: void 0,
                prevTime: void 0,
              },
            };
          "onGestureStart onGestureChange onGestureEnd onTouchStart onTouchMove onTouchEnd onTransitionEnd toggle enable disable in out"
            .split(" ")
            .forEach(function (e) {
              a[e] = W[e].bind(t);
            }),
            X.extend(t, { zoom: a });
        },
        on: {
          init: function () {
            this.params.zoom.enabled && this.zoom.enable();
          },
          destroy: function () {
            this.zoom.disable();
          },
          touchStart: function (e) {
            this.zoom.enabled && this.zoom.onTouchStart(e);
          },
          touchEnd: function (e) {
            this.zoom.enabled && this.zoom.onTouchEnd(e);
          },
          doubleTap: function (e) {
            this.params.zoom.enabled &&
              this.zoom.enabled &&
              this.params.zoom.toggle &&
              this.zoom.toggle(e);
          },
          transitionEnd: function () {
            this.zoom.enabled &&
              this.params.zoom.enabled &&
              this.zoom.onTransitionEnd();
          },
        },
      },
      {
        name: "lazy",
        params: {
          lazy: {
            enabled: !1,
            loadPrevNext: !1,
            loadPrevNextAmount: 1,
            loadOnTransitionStart: !1,
            elementClass: "swiper-lazy",
            loadingClass: "swiper-lazy-loading",
            loadedClass: "swiper-lazy-loaded",
            preloaderClass: "swiper-lazy-preloader",
          },
        },
        create: function () {
          X.extend(this, {
            lazy: {
              initialImageLoaded: !1,
              load: q.load.bind(this),
              loadInSlide: q.loadInSlide.bind(this),
            },
          });
        },
        on: {
          beforeInit: function () {
            this.params.lazy.enabled &&
              this.params.preloadImages &&
              (this.params.preloadImages = !1);
          },
          init: function () {
            this.params.lazy.enabled &&
              !this.params.loop &&
              0 === this.params.initialSlide &&
              this.lazy.load();
          },
          scroll: function () {
            this.params.freeMode &&
              !this.params.freeModeSticky &&
              this.lazy.load();
          },
          resize: function () {
            this.params.lazy.enabled && this.lazy.load();
          },
          scrollbarDragMove: function () {
            this.params.lazy.enabled && this.lazy.load();
          },
          transitionStart: function () {
            var e = this;
            e.params.lazy.enabled &&
              (e.params.lazy.loadOnTransitionStart ||
                (!e.params.lazy.loadOnTransitionStart &&
                  !e.lazy.initialImageLoaded)) &&
              e.lazy.load();
          },
          transitionEnd: function () {
            this.params.lazy.enabled &&
              !this.params.lazy.loadOnTransitionStart &&
              this.lazy.load();
          },
        },
      },
      {
        name: "controller",
        params: { controller: { control: void 0, inverse: !1, by: "slide" } },
        create: function () {
          var e = this;
          X.extend(e, {
            controller: {
              control: e.params.controller.control,
              getInterpolateFunction: j.getInterpolateFunction.bind(e),
              setTranslate: j.setTranslate.bind(e),
              setTransition: j.setTransition.bind(e),
            },
          });
        },
        on: {
          update: function () {
            this.controller.control &&
              this.controller.spline &&
              ((this.controller.spline = void 0),
              delete this.controller.spline);
          },
          resize: function () {
            this.controller.control &&
              this.controller.spline &&
              ((this.controller.spline = void 0),
              delete this.controller.spline);
          },
          observerUpdate: function () {
            this.controller.control &&
              this.controller.spline &&
              ((this.controller.spline = void 0),
              delete this.controller.spline);
          },
          setTranslate: function (e, t) {
            this.controller.control && this.controller.setTranslate(e, t);
          },
          setTransition: function (e, t) {
            this.controller.control && this.controller.setTransition(e, t);
          },
        },
      },
      {
        name: "a11y",
        params: {
          a11y: {
            enabled: !0,
            notificationClass: "swiper-notification",
            prevSlideMessage: "Previous slide",
            nextSlideMessage: "Next slide",
            firstSlideMessage: "This is the first slide",
            lastSlideMessage: "This is the last slide",
            paginationBulletMessage: "Go to slide {{index}}",
          },
        },
        create: function () {
          var t = this;
          X.extend(t, {
            a11y: {
              liveRegion: L(
                '<span class="' +
                  t.params.a11y.notificationClass +
                  '" aria-live="assertive" aria-atomic="true"></span>'
              ),
            },
          }),
            Object.keys(K).forEach(function (e) {
              t.a11y[e] = K[e].bind(t);
            });
        },
        on: {
          init: function () {
            this.params.a11y.enabled &&
              (this.a11y.init(), this.a11y.updateNavigation());
          },
          toEdge: function () {
            this.params.a11y.enabled && this.a11y.updateNavigation();
          },
          fromEdge: function () {
            this.params.a11y.enabled && this.a11y.updateNavigation();
          },
          paginationUpdate: function () {
            this.params.a11y.enabled && this.a11y.updatePagination();
          },
          destroy: function () {
            this.params.a11y.enabled && this.a11y.destroy();
          },
        },
      },
      {
        name: "history",
        params: { history: { enabled: !1, replaceState: !1, key: "slides" } },
        create: function () {
          var e = this;
          X.extend(e, {
            history: {
              init: U.init.bind(e),
              setHistory: U.setHistory.bind(e),
              setHistoryPopState: U.setHistoryPopState.bind(e),
              scrollToSlide: U.scrollToSlide.bind(e),
              destroy: U.destroy.bind(e),
            },
          });
        },
        on: {
          init: function () {
            this.params.history.enabled && this.history.init();
          },
          destroy: function () {
            this.params.history.enabled && this.history.destroy();
          },
          transitionEnd: function () {
            this.history.initialized &&
              this.history.setHistory(
                this.params.history.key,
                this.activeIndex
              );
          },
        },
      },
      {
        name: "hash-navigation",
        params: {
          hashNavigation: { enabled: !1, replaceState: !1, watchState: !1 },
        },
        create: function () {
          var e = this;
          X.extend(e, {
            hashNavigation: {
              initialized: !1,
              init: _.init.bind(e),
              destroy: _.destroy.bind(e),
              setHash: _.setHash.bind(e),
              onHashCange: _.onHashCange.bind(e),
            },
          });
        },
        on: {
          init: function () {
            this.params.hashNavigation.enabled && this.hashNavigation.init();
          },
          destroy: function () {
            this.params.hashNavigation.enabled && this.hashNavigation.destroy();
          },
          transitionEnd: function () {
            this.hashNavigation.initialized && this.hashNavigation.setHash();
          },
        },
      },
      {
        name: "autoplay",
        params: {
          autoplay: {
            enabled: !1,
            delay: 3e3,
            waitForTransition: !0,
            disableOnInteraction: !0,
            stopOnLastSlide: !1,
            reverseDirection: !1,
          },
        },
        create: function () {
          var t = this;
          X.extend(t, {
            autoplay: {
              running: !1,
              paused: !1,
              run: Z.run.bind(t),
              start: Z.start.bind(t),
              stop: Z.stop.bind(t),
              pause: Z.pause.bind(t),
              onTransitionEnd: function (e) {
                t &&
                  !t.destroyed &&
                  t.$wrapperEl &&
                  e.target === this &&
                  (t.$wrapperEl[0].removeEventListener(
                    "transitionend",
                    t.autoplay.onTransitionEnd
                  ),
                  t.$wrapperEl[0].removeEventListener(
                    "webkitTransitionEnd",
                    t.autoplay.onTransitionEnd
                  ),
                  (t.autoplay.paused = !1),
                  t.autoplay.running ? t.autoplay.run() : t.autoplay.stop());
              },
            },
          });
        },
        on: {
          init: function () {
            this.params.autoplay.enabled && this.autoplay.start();
          },
          beforeTransitionStart: function (e, t) {
            this.autoplay.running &&
              (t || !this.params.autoplay.disableOnInteraction
                ? this.autoplay.pause(e)
                : this.autoplay.stop());
          },
          sliderFirstMove: function () {
            this.autoplay.running &&
              (this.params.autoplay.disableOnInteraction
                ? this.autoplay.stop()
                : this.autoplay.pause());
          },
          destroy: function () {
            this.autoplay.running && this.autoplay.stop();
          },
        },
      },
      {
        name: "effect-fade",
        params: { fadeEffect: { crossFade: !1 } },
        create: function () {
          X.extend(this, {
            fadeEffect: {
              setTranslate: Q.setTranslate.bind(this),
              setTransition: Q.setTransition.bind(this),
            },
          });
        },
        on: {
          beforeInit: function () {
            var e = this;
            if ("fade" === e.params.effect) {
              e.classNames.push(e.params.containerModifierClass + "fade");
              var t = {
                slidesPerView: 1,
                slidesPerColumn: 1,
                slidesPerGroup: 1,
                watchSlidesProgress: !0,
                spaceBetween: 0,
                virtualTranslate: !0,
              };
              X.extend(e.params, t), X.extend(e.originalParams, t);
            }
          },
          setTranslate: function () {
            "fade" === this.params.effect && this.fadeEffect.setTranslate();
          },
          setTransition: function (e) {
            "fade" === this.params.effect && this.fadeEffect.setTransition(e);
          },
        },
      },
      {
        name: "effect-cube",
        params: {
          cubeEffect: {
            slideShadows: !0,
            shadow: !0,
            shadowOffset: 20,
            shadowScale: 0.94,
          },
        },
        create: function () {
          X.extend(this, {
            cubeEffect: {
              setTranslate: J.setTranslate.bind(this),
              setTransition: J.setTransition.bind(this),
            },
          });
        },
        on: {
          beforeInit: function () {
            var e = this;
            if ("cube" === e.params.effect) {
              e.classNames.push(e.params.containerModifierClass + "cube"),
                e.classNames.push(e.params.containerModifierClass + "3d");
              var t = {
                slidesPerView: 1,
                slidesPerColumn: 1,
                slidesPerGroup: 1,
                watchSlidesProgress: !0,
                resistanceRatio: 0,
                spaceBetween: 0,
                centeredSlides: !1,
                virtualTranslate: !0,
              };
              X.extend(e.params, t), X.extend(e.originalParams, t);
            }
          },
          setTranslate: function () {
            "cube" === this.params.effect && this.cubeEffect.setTranslate();
          },
          setTransition: function (e) {
            "cube" === this.params.effect && this.cubeEffect.setTransition(e);
          },
        },
      },
      {
        name: "effect-flip",
        params: { flipEffect: { slideShadows: !0, limitRotation: !0 } },
        create: function () {
          X.extend(this, {
            flipEffect: {
              setTranslate: ee.setTranslate.bind(this),
              setTransition: ee.setTransition.bind(this),
            },
          });
        },
        on: {
          beforeInit: function () {
            var e = this;
            if ("flip" === e.params.effect) {
              e.classNames.push(e.params.containerModifierClass + "flip"),
                e.classNames.push(e.params.containerModifierClass + "3d");
              var t = {
                slidesPerView: 1,
                slidesPerColumn: 1,
                slidesPerGroup: 1,
                watchSlidesProgress: !0,
                spaceBetween: 0,
                virtualTranslate: !0,
              };
              X.extend(e.params, t), X.extend(e.originalParams, t);
            }
          },
          setTranslate: function () {
            "flip" === this.params.effect && this.flipEffect.setTranslate();
          },
          setTransition: function (e) {
            "flip" === this.params.effect && this.flipEffect.setTransition(e);
          },
        },
      },
      {
        name: "effect-coverflow",
        params: {
          coverflowEffect: {
            rotate: 50,
            stretch: 0,
            depth: 100,
            modifier: 1,
            slideShadows: !0,
          },
        },
        create: function () {
          X.extend(this, {
            coverflowEffect: {
              setTranslate: te.setTranslate.bind(this),
              setTransition: te.setTransition.bind(this),
            },
          });
        },
        on: {
          beforeInit: function () {
            var e = this;
            "coverflow" === e.params.effect &&
              (e.classNames.push(e.params.containerModifierClass + "coverflow"),
              e.classNames.push(e.params.containerModifierClass + "3d"),
              (e.params.watchSlidesProgress = !0),
              (e.originalParams.watchSlidesProgress = !0));
          },
          setTranslate: function () {
            "coverflow" === this.params.effect &&
              this.coverflowEffect.setTranslate();
          },
          setTransition: function (e) {
            "coverflow" === this.params.effect &&
              this.coverflowEffect.setTransition(e);
          },
        },
      },
    ];
  return (
    void 0 === S.use &&
      ((S.use = S.Class.use), (S.installModule = S.Class.installModule)),
    S.use(ae),
    S
  );
});

//     Underscore.js 1.8.3
//     http://underscorejs.org
//     (c) 2009-2015 Jeremy Ashkenas, DocumentCloud and Investigative Reporters & Editors
//     Underscore may be freely distributed under the MIT license.
(function () {
  function n(n) {
    function t(t, r, e, u, i, o) {
      for (; i >= 0 && o > i; i += n) {
        var a = u ? u[i] : i;
        e = r(e, t[a], a, t);
      }
      return e;
    }
    return function (r, e, u, i) {
      e = b(e, i, 4);
      var o = !k(r) && m.keys(r),
        a = (o || r).length,
        c = n > 0 ? 0 : a - 1;
      return (
        arguments.length < 3 && ((u = r[o ? o[c] : c]), (c += n)),
        t(r, e, u, o, c, a)
      );
    };
  }
  function t(n) {
    return function (t, r, e) {
      r = x(r, e);
      for (var u = O(t), i = n > 0 ? 0 : u - 1; i >= 0 && u > i; i += n)
        if (r(t[i], i, t)) return i;
      return -1;
    };
  }
  function r(n, t, r) {
    return function (e, u, i) {
      var o = 0,
        a = O(e);
      if ("number" == typeof i)
        n > 0
          ? (o = i >= 0 ? i : Math.max(i + a, o))
          : (a = i >= 0 ? Math.min(i + 1, a) : i + a + 1);
      else if (r && i && a) return (i = r(e, u)), e[i] === u ? i : -1;
      if (u !== u)
        return (i = t(l.call(e, o, a), m.isNaN)), i >= 0 ? i + o : -1;
      for (i = n > 0 ? o : a - 1; i >= 0 && a > i; i += n)
        if (e[i] === u) return i;
      return -1;
    };
  }
  function e(n, t) {
    var r = I.length,
      e = n.constructor,
      u = (m.isFunction(e) && e.prototype) || a,
      i = "constructor";
    for (m.has(n, i) && !m.contains(t, i) && t.push(i); r--; )
      (i = I[r]), i in n && n[i] !== u[i] && !m.contains(t, i) && t.push(i);
  }
  var u = this,
    i = u._,
    o = Array.prototype,
    a = Object.prototype,
    c = Function.prototype,
    f = o.push,
    l = o.slice,
    s = a.toString,
    p = a.hasOwnProperty,
    h = Array.isArray,
    v = Object.keys,
    g = c.bind,
    y = Object.create,
    d = function () {},
    m = function (n) {
      return n instanceof m
        ? n
        : this instanceof m
          ? void (this._wrapped = n)
          : new m(n);
    };
  "undefined" != typeof exports
    ? ("undefined" != typeof module &&
        module.exports &&
        (exports = module.exports = m),
      (exports._ = m))
    : (u._ = m),
    (m.VERSION = "1.8.3");
  var b = function (n, t, r) {
      if (t === void 0) return n;
      switch (null == r ? 3 : r) {
        case 1:
          return function (r) {
            return n.call(t, r);
          };
        case 2:
          return function (r, e) {
            return n.call(t, r, e);
          };
        case 3:
          return function (r, e, u) {
            return n.call(t, r, e, u);
          };
        case 4:
          return function (r, e, u, i) {
            return n.call(t, r, e, u, i);
          };
      }
      return function () {
        return n.apply(t, arguments);
      };
    },
    x = function (n, t, r) {
      return null == n
        ? m.identity
        : m.isFunction(n)
          ? b(n, t, r)
          : m.isObject(n)
            ? m.matcher(n)
            : m.property(n);
    };
  m.iteratee = function (n, t) {
    return x(n, t, 1 / 0);
  };
  var _ = function (n, t) {
      return function (r) {
        var e = arguments.length;
        if (2 > e || null == r) return r;
        for (var u = 1; e > u; u++)
          for (
            var i = arguments[u], o = n(i), a = o.length, c = 0;
            a > c;
            c++
          ) {
            var f = o[c];
            (t && r[f] !== void 0) || (r[f] = i[f]);
          }
        return r;
      };
    },
    j = function (n) {
      if (!m.isObject(n)) return {};
      if (y) return y(n);
      d.prototype = n;
      var t = new d();
      return (d.prototype = null), t;
    },
    w = function (n) {
      return function (t) {
        return null == t ? void 0 : t[n];
      };
    },
    A = Math.pow(2, 53) - 1,
    O = w("length"),
    k = function (n) {
      var t = O(n);
      return "number" == typeof t && t >= 0 && A >= t;
    };
  (m.each = m.forEach =
    function (n, t, r) {
      t = b(t, r);
      var e, u;
      if (k(n)) for (e = 0, u = n.length; u > e; e++) t(n[e], e, n);
      else {
        var i = m.keys(n);
        for (e = 0, u = i.length; u > e; e++) t(n[i[e]], i[e], n);
      }
      return n;
    }),
    (m.map = m.collect =
      function (n, t, r) {
        t = x(t, r);
        for (
          var e = !k(n) && m.keys(n), u = (e || n).length, i = Array(u), o = 0;
          u > o;
          o++
        ) {
          var a = e ? e[o] : o;
          i[o] = t(n[a], a, n);
        }
        return i;
      }),
    (m.reduce = m.foldl = m.inject = n(1)),
    (m.reduceRight = m.foldr = n(-1)),
    (m.find = m.detect =
      function (n, t, r) {
        var e;
        return (
          (e = k(n) ? m.findIndex(n, t, r) : m.findKey(n, t, r)),
          e !== void 0 && e !== -1 ? n[e] : void 0
        );
      }),
    (m.filter = m.select =
      function (n, t, r) {
        var e = [];
        return (
          (t = x(t, r)),
          m.each(n, function (n, r, u) {
            t(n, r, u) && e.push(n);
          }),
          e
        );
      }),
    (m.reject = function (n, t, r) {
      return m.filter(n, m.negate(x(t)), r);
    }),
    (m.every = m.all =
      function (n, t, r) {
        t = x(t, r);
        for (
          var e = !k(n) && m.keys(n), u = (e || n).length, i = 0;
          u > i;
          i++
        ) {
          var o = e ? e[i] : i;
          if (!t(n[o], o, n)) return !1;
        }
        return !0;
      }),
    (m.some = m.any =
      function (n, t, r) {
        t = x(t, r);
        for (
          var e = !k(n) && m.keys(n), u = (e || n).length, i = 0;
          u > i;
          i++
        ) {
          var o = e ? e[i] : i;
          if (t(n[o], o, n)) return !0;
        }
        return !1;
      }),
    (m.contains =
      m.includes =
      m.include =
        function (n, t, r, e) {
          return (
            k(n) || (n = m.values(n)),
            ("number" != typeof r || e) && (r = 0),
            m.indexOf(n, t, r) >= 0
          );
        }),
    (m.invoke = function (n, t) {
      var r = l.call(arguments, 2),
        e = m.isFunction(t);
      return m.map(n, function (n) {
        var u = e ? t : n[t];
        return null == u ? u : u.apply(n, r);
      });
    }),
    (m.pluck = function (n, t) {
      return m.map(n, m.property(t));
    }),
    (m.where = function (n, t) {
      return m.filter(n, m.matcher(t));
    }),
    (m.findWhere = function (n, t) {
      return m.find(n, m.matcher(t));
    }),
    (m.max = function (n, t, r) {
      var e,
        u,
        i = -1 / 0,
        o = -1 / 0;
      if (null == t && null != n) {
        n = k(n) ? n : m.values(n);
        for (var a = 0, c = n.length; c > a; a++) (e = n[a]), e > i && (i = e);
      } else
        (t = x(t, r)),
          m.each(n, function (n, r, e) {
            (u = t(n, r, e)),
              (u > o || (u === -1 / 0 && i === -1 / 0)) && ((i = n), (o = u));
          });
      return i;
    }),
    (m.min = function (n, t, r) {
      var e,
        u,
        i = 1 / 0,
        o = 1 / 0;
      if (null == t && null != n) {
        n = k(n) ? n : m.values(n);
        for (var a = 0, c = n.length; c > a; a++) (e = n[a]), i > e && (i = e);
      } else
        (t = x(t, r)),
          m.each(n, function (n, r, e) {
            (u = t(n, r, e)),
              (o > u || (1 / 0 === u && 1 / 0 === i)) && ((i = n), (o = u));
          });
      return i;
    }),
    (m.shuffle = function (n) {
      for (
        var t, r = k(n) ? n : m.values(n), e = r.length, u = Array(e), i = 0;
        e > i;
        i++
      )
        (t = m.random(0, i)), t !== i && (u[i] = u[t]), (u[t] = r[i]);
      return u;
    }),
    (m.sample = function (n, t, r) {
      return null == t || r
        ? (k(n) || (n = m.values(n)), n[m.random(n.length - 1)])
        : m.shuffle(n).slice(0, Math.max(0, t));
    }),
    (m.sortBy = function (n, t, r) {
      return (
        (t = x(t, r)),
        m.pluck(
          m
            .map(n, function (n, r, e) {
              return { value: n, index: r, criteria: t(n, r, e) };
            })
            .sort(function (n, t) {
              var r = n.criteria,
                e = t.criteria;
              if (r !== e) {
                if (r > e || r === void 0) return 1;
                if (e > r || e === void 0) return -1;
              }
              return n.index - t.index;
            }),
          "value"
        )
      );
    });
  var F = function (n) {
    return function (t, r, e) {
      var u = {};
      return (
        (r = x(r, e)),
        m.each(t, function (e, i) {
          var o = r(e, i, t);
          n(u, e, o);
        }),
        u
      );
    };
  };
  (m.groupBy = F(function (n, t, r) {
    m.has(n, r) ? n[r].push(t) : (n[r] = [t]);
  })),
    (m.indexBy = F(function (n, t, r) {
      n[r] = t;
    })),
    (m.countBy = F(function (n, t, r) {
      m.has(n, r) ? n[r]++ : (n[r] = 1);
    })),
    (m.toArray = function (n) {
      return n
        ? m.isArray(n)
          ? l.call(n)
          : k(n)
            ? m.map(n, m.identity)
            : m.values(n)
        : [];
    }),
    (m.size = function (n) {
      return null == n ? 0 : k(n) ? n.length : m.keys(n).length;
    }),
    (m.partition = function (n, t, r) {
      t = x(t, r);
      var e = [],
        u = [];
      return (
        m.each(n, function (n, r, i) {
          (t(n, r, i) ? e : u).push(n);
        }),
        [e, u]
      );
    }),
    (m.first =
      m.head =
      m.take =
        function (n, t, r) {
          return null == n
            ? void 0
            : null == t || r
              ? n[0]
              : m.initial(n, n.length - t);
        }),
    (m.initial = function (n, t, r) {
      return l.call(n, 0, Math.max(0, n.length - (null == t || r ? 1 : t)));
    }),
    (m.last = function (n, t, r) {
      return null == n
        ? void 0
        : null == t || r
          ? n[n.length - 1]
          : m.rest(n, Math.max(0, n.length - t));
    }),
    (m.rest =
      m.tail =
      m.drop =
        function (n, t, r) {
          return l.call(n, null == t || r ? 1 : t);
        }),
    (m.compact = function (n) {
      return m.filter(n, m.identity);
    });
  var S = function (n, t, r, e) {
    for (var u = [], i = 0, o = e || 0, a = O(n); a > o; o++) {
      var c = n[o];
      if (k(c) && (m.isArray(c) || m.isArguments(c))) {
        t || (c = S(c, t, r));
        var f = 0,
          l = c.length;
        for (u.length += l; l > f; ) u[i++] = c[f++];
      } else r || (u[i++] = c);
    }
    return u;
  };
  (m.flatten = function (n, t) {
    return S(n, t, !1);
  }),
    (m.without = function (n) {
      return m.difference(n, l.call(arguments, 1));
    }),
    (m.uniq = m.unique =
      function (n, t, r, e) {
        m.isBoolean(t) || ((e = r), (r = t), (t = !1)),
          null != r && (r = x(r, e));
        for (var u = [], i = [], o = 0, a = O(n); a > o; o++) {
          var c = n[o],
            f = r ? r(c, o, n) : c;
          t
            ? ((o && i === f) || u.push(c), (i = f))
            : r
              ? m.contains(i, f) || (i.push(f), u.push(c))
              : m.contains(u, c) || u.push(c);
        }
        return u;
      }),
    (m.union = function () {
      return m.uniq(S(arguments, !0, !0));
    }),
    (m.intersection = function (n) {
      for (var t = [], r = arguments.length, e = 0, u = O(n); u > e; e++) {
        var i = n[e];
        if (!m.contains(t, i)) {
          for (var o = 1; r > o && m.contains(arguments[o], i); o++);
          o === r && t.push(i);
        }
      }
      return t;
    }),
    (m.difference = function (n) {
      var t = S(arguments, !0, !0, 1);
      return m.filter(n, function (n) {
        return !m.contains(t, n);
      });
    }),
    (m.zip = function () {
      return m.unzip(arguments);
    }),
    (m.unzip = function (n) {
      for (
        var t = (n && m.max(n, O).length) || 0, r = Array(t), e = 0;
        t > e;
        e++
      )
        r[e] = m.pluck(n, e);
      return r;
    }),
    (m.object = function (n, t) {
      for (var r = {}, e = 0, u = O(n); u > e; e++)
        t ? (r[n[e]] = t[e]) : (r[n[e][0]] = n[e][1]);
      return r;
    }),
    (m.findIndex = t(1)),
    (m.findLastIndex = t(-1)),
    (m.sortedIndex = function (n, t, r, e) {
      r = x(r, e, 1);
      for (var u = r(t), i = 0, o = O(n); o > i; ) {
        var a = Math.floor((i + o) / 2);
        r(n[a]) < u ? (i = a + 1) : (o = a);
      }
      return i;
    }),
    (m.indexOf = r(1, m.findIndex, m.sortedIndex)),
    (m.lastIndexOf = r(-1, m.findLastIndex)),
    (m.range = function (n, t, r) {
      null == t && ((t = n || 0), (n = 0)), (r = r || 1);
      for (
        var e = Math.max(Math.ceil((t - n) / r), 0), u = Array(e), i = 0;
        e > i;
        i++, n += r
      )
        u[i] = n;
      return u;
    });
  var E = function (n, t, r, e, u) {
    if (!(e instanceof t)) return n.apply(r, u);
    var i = j(n.prototype),
      o = n.apply(i, u);
    return m.isObject(o) ? o : i;
  };
  (m.bind = function (n, t) {
    if (g && n.bind === g) return g.apply(n, l.call(arguments, 1));
    if (!m.isFunction(n))
      throw new TypeError("Bind must be called on a function");
    var r = l.call(arguments, 2),
      e = function () {
        return E(n, e, t, this, r.concat(l.call(arguments)));
      };
    return e;
  }),
    (m.partial = function (n) {
      var t = l.call(arguments, 1),
        r = function () {
          for (var e = 0, u = t.length, i = Array(u), o = 0; u > o; o++)
            i[o] = t[o] === m ? arguments[e++] : t[o];
          for (; e < arguments.length; ) i.push(arguments[e++]);
          return E(n, r, this, this, i);
        };
      return r;
    }),
    (m.bindAll = function (n) {
      var t,
        r,
        e = arguments.length;
      if (1 >= e) throw new Error("bindAll must be passed function names");
      for (t = 1; e > t; t++) (r = arguments[t]), (n[r] = m.bind(n[r], n));
      return n;
    }),
    (m.memoize = function (n, t) {
      var r = function (e) {
        var u = r.cache,
          i = "" + (t ? t.apply(this, arguments) : e);
        return m.has(u, i) || (u[i] = n.apply(this, arguments)), u[i];
      };
      return (r.cache = {}), r;
    }),
    (m.delay = function (n, t) {
      var r = l.call(arguments, 2);
      return setTimeout(function () {
        return n.apply(null, r);
      }, t);
    }),
    (m.defer = m.partial(m.delay, m, 1)),
    (m.throttle = function (n, t, r) {
      var e,
        u,
        i,
        o = null,
        a = 0;
      r || (r = {});
      var c = function () {
        (a = r.leading === !1 ? 0 : m.now()),
          (o = null),
          (i = n.apply(e, u)),
          o || (e = u = null);
      };
      return function () {
        var f = m.now();
        a || r.leading !== !1 || (a = f);
        var l = t - (f - a);
        return (
          (e = this),
          (u = arguments),
          0 >= l || l > t
            ? (o && (clearTimeout(o), (o = null)),
              (a = f),
              (i = n.apply(e, u)),
              o || (e = u = null))
            : o || r.trailing === !1 || (o = setTimeout(c, l)),
          i
        );
      };
    }),
    (m.debounce = function (n, t, r) {
      var e,
        u,
        i,
        o,
        a,
        c = function () {
          var f = m.now() - o;
          t > f && f >= 0
            ? (e = setTimeout(c, t - f))
            : ((e = null), r || ((a = n.apply(i, u)), e || (i = u = null)));
        };
      return function () {
        (i = this), (u = arguments), (o = m.now());
        var f = r && !e;
        return (
          e || (e = setTimeout(c, t)),
          f && ((a = n.apply(i, u)), (i = u = null)),
          a
        );
      };
    }),
    (m.wrap = function (n, t) {
      return m.partial(t, n);
    }),
    (m.negate = function (n) {
      return function () {
        return !n.apply(this, arguments);
      };
    }),
    (m.compose = function () {
      var n = arguments,
        t = n.length - 1;
      return function () {
        for (var r = t, e = n[t].apply(this, arguments); r--; )
          e = n[r].call(this, e);
        return e;
      };
    }),
    (m.after = function (n, t) {
      return function () {
        return --n < 1 ? t.apply(this, arguments) : void 0;
      };
    }),
    (m.before = function (n, t) {
      var r;
      return function () {
        return (
          --n > 0 && (r = t.apply(this, arguments)), 1 >= n && (t = null), r
        );
      };
    }),
    (m.once = m.partial(m.before, 2));
  var M = !{ toString: null }.propertyIsEnumerable("toString"),
    I = [
      "valueOf",
      "isPrototypeOf",
      "toString",
      "propertyIsEnumerable",
      "hasOwnProperty",
      "toLocaleString",
    ];
  (m.keys = function (n) {
    if (!m.isObject(n)) return [];
    if (v) return v(n);
    var t = [];
    for (var r in n) m.has(n, r) && t.push(r);
    return M && e(n, t), t;
  }),
    (m.allKeys = function (n) {
      if (!m.isObject(n)) return [];
      var t = [];
      for (var r in n) t.push(r);
      return M && e(n, t), t;
    }),
    (m.values = function (n) {
      for (var t = m.keys(n), r = t.length, e = Array(r), u = 0; r > u; u++)
        e[u] = n[t[u]];
      return e;
    }),
    (m.mapObject = function (n, t, r) {
      t = x(t, r);
      for (var e, u = m.keys(n), i = u.length, o = {}, a = 0; i > a; a++)
        (e = u[a]), (o[e] = t(n[e], e, n));
      return o;
    }),
    (m.pairs = function (n) {
      for (var t = m.keys(n), r = t.length, e = Array(r), u = 0; r > u; u++)
        e[u] = [t[u], n[t[u]]];
      return e;
    }),
    (m.invert = function (n) {
      for (var t = {}, r = m.keys(n), e = 0, u = r.length; u > e; e++)
        t[n[r[e]]] = r[e];
      return t;
    }),
    (m.functions = m.methods =
      function (n) {
        var t = [];
        for (var r in n) m.isFunction(n[r]) && t.push(r);
        return t.sort();
      }),
    (m.extend = _(m.allKeys)),
    (m.extendOwn = m.assign = _(m.keys)),
    (m.findKey = function (n, t, r) {
      t = x(t, r);
      for (var e, u = m.keys(n), i = 0, o = u.length; o > i; i++)
        if (((e = u[i]), t(n[e], e, n))) return e;
    }),
    (m.pick = function (n, t, r) {
      var e,
        u,
        i = {},
        o = n;
      if (null == o) return i;
      m.isFunction(t)
        ? ((u = m.allKeys(o)), (e = b(t, r)))
        : ((u = S(arguments, !1, !1, 1)),
          (e = function (n, t, r) {
            return t in r;
          }),
          (o = Object(o)));
      for (var a = 0, c = u.length; c > a; a++) {
        var f = u[a],
          l = o[f];
        e(l, f, o) && (i[f] = l);
      }
      return i;
    }),
    (m.omit = function (n, t, r) {
      if (m.isFunction(t)) t = m.negate(t);
      else {
        var e = m.map(S(arguments, !1, !1, 1), String);
        t = function (n, t) {
          return !m.contains(e, t);
        };
      }
      return m.pick(n, t, r);
    }),
    (m.defaults = _(m.allKeys, !0)),
    (m.create = function (n, t) {
      var r = j(n);
      return t && m.extendOwn(r, t), r;
    }),
    (m.clone = function (n) {
      return m.isObject(n) ? (m.isArray(n) ? n.slice() : m.extend({}, n)) : n;
    }),
    (m.tap = function (n, t) {
      return t(n), n;
    }),
    (m.isMatch = function (n, t) {
      var r = m.keys(t),
        e = r.length;
      if (null == n) return !e;
      for (var u = Object(n), i = 0; e > i; i++) {
        var o = r[i];
        if (t[o] !== u[o] || !(o in u)) return !1;
      }
      return !0;
    });
  var N = function (n, t, r, e) {
    if (n === t) return 0 !== n || 1 / n === 1 / t;
    if (null == n || null == t) return n === t;
    n instanceof m && (n = n._wrapped), t instanceof m && (t = t._wrapped);
    var u = s.call(n);
    if (u !== s.call(t)) return !1;
    switch (u) {
      case "[object RegExp]":
      case "[object String]":
        return "" + n == "" + t;
      case "[object Number]":
        return +n !== +n ? +t !== +t : 0 === +n ? 1 / +n === 1 / t : +n === +t;
      case "[object Date]":
      case "[object Boolean]":
        return +n === +t;
    }
    var i = "[object Array]" === u;
    if (!i) {
      if ("object" != typeof n || "object" != typeof t) return !1;
      var o = n.constructor,
        a = t.constructor;
      if (
        o !== a &&
        !(
          m.isFunction(o) &&
          o instanceof o &&
          m.isFunction(a) &&
          a instanceof a
        ) &&
        "constructor" in n &&
        "constructor" in t
      )
        return !1;
    }
    (r = r || []), (e = e || []);
    for (var c = r.length; c--; ) if (r[c] === n) return e[c] === t;
    if ((r.push(n), e.push(t), i)) {
      if (((c = n.length), c !== t.length)) return !1;
      for (; c--; ) if (!N(n[c], t[c], r, e)) return !1;
    } else {
      var f,
        l = m.keys(n);
      if (((c = l.length), m.keys(t).length !== c)) return !1;
      for (; c--; )
        if (((f = l[c]), !m.has(t, f) || !N(n[f], t[f], r, e))) return !1;
    }
    return r.pop(), e.pop(), !0;
  };
  (m.isEqual = function (n, t) {
    return N(n, t);
  }),
    (m.isEmpty = function (n) {
      return null == n
        ? !0
        : k(n) && (m.isArray(n) || m.isString(n) || m.isArguments(n))
          ? 0 === n.length
          : 0 === m.keys(n).length;
    }),
    (m.isElement = function (n) {
      return !(!n || 1 !== n.nodeType);
    }),
    (m.isArray =
      h ||
      function (n) {
        return "[object Array]" === s.call(n);
      }),
    (m.isObject = function (n) {
      var t = typeof n;
      return "function" === t || ("object" === t && !!n);
    }),
    m.each(
      ["Arguments", "Function", "String", "Number", "Date", "RegExp", "Error"],
      function (n) {
        m["is" + n] = function (t) {
          return s.call(t) === "[object " + n + "]";
        };
      }
    ),
    m.isArguments(arguments) ||
      (m.isArguments = function (n) {
        return m.has(n, "callee");
      }),
    "function" != typeof /./ &&
      "object" != typeof Int8Array &&
      (m.isFunction = function (n) {
        return "function" == typeof n || !1;
      }),
    (m.isFinite = function (n) {
      return isFinite(n) && !isNaN(parseFloat(n));
    }),
    (m.isNaN = function (n) {
      return m.isNumber(n) && n !== +n;
    }),
    (m.isBoolean = function (n) {
      return n === !0 || n === !1 || "[object Boolean]" === s.call(n);
    }),
    (m.isNull = function (n) {
      return null === n;
    }),
    (m.isUndefined = function (n) {
      return n === void 0;
    }),
    (m.has = function (n, t) {
      return null != n && p.call(n, t);
    }),
    (m.noConflict = function () {
      return (u._ = i), this;
    }),
    (m.identity = function (n) {
      return n;
    }),
    (m.constant = function (n) {
      return function () {
        return n;
      };
    }),
    (m.noop = function () {}),
    (m.property = w),
    (m.propertyOf = function (n) {
      return null == n
        ? function () {}
        : function (t) {
            return n[t];
          };
    }),
    (m.matcher = m.matches =
      function (n) {
        return (
          (n = m.extendOwn({}, n)),
          function (t) {
            return m.isMatch(t, n);
          }
        );
      }),
    (m.times = function (n, t, r) {
      var e = Array(Math.max(0, n));
      t = b(t, r, 1);
      for (var u = 0; n > u; u++) e[u] = t(u);
      return e;
    }),
    (m.random = function (n, t) {
      return (
        null == t && ((t = n), (n = 0)),
        n + Math.floor(Math.random() * (t - n + 1))
      );
    }),
    (m.now =
      Date.now ||
      function () {
        return new Date().getTime();
      });
  var B = {
      "&": "&amp;",
      "<": "&lt;",
      ">": "&gt;",
      '"': "&quot;",
      "'": "&#x27;",
      "`": "&#x60;",
    },
    T = m.invert(B),
    R = function (n) {
      var t = function (t) {
          return n[t];
        },
        r = "(?:" + m.keys(n).join("|") + ")",
        e = RegExp(r),
        u = RegExp(r, "g");
      return function (n) {
        return (n = null == n ? "" : "" + n), e.test(n) ? n.replace(u, t) : n;
      };
    };
  (m.escape = R(B)),
    (m.unescape = R(T)),
    (m.result = function (n, t, r) {
      var e = null == n ? void 0 : n[t];
      return e === void 0 && (e = r), m.isFunction(e) ? e.call(n) : e;
    });
  var q = 0;
  (m.uniqueId = function (n) {
    var t = ++q + "";
    return n ? n + t : t;
  }),
    (m.templateSettings = {
      evaluate: /<%([\s\S]+?)%>/g,
      interpolate: /<%=([\s\S]+?)%>/g,
      escape: /<%-([\s\S]+?)%>/g,
    });
  var K = /(.)^/,
    z = {
      "'": "'",
      "\\": "\\",
      "\r": "r",
      "\n": "n",
      "\u2028": "u2028",
      "\u2029": "u2029",
    },
    D = /\\|'|\r|\n|\u2028|\u2029/g,
    L = function (n) {
      return "\\" + z[n];
    };
  (m.template = function (n, t, r) {
    !t && r && (t = r), (t = m.defaults({}, t, m.templateSettings));
    var e = RegExp(
        [
          (t.escape || K).source,
          (t.interpolate || K).source,
          (t.evaluate || K).source,
        ].join("|") + "|$",
        "g"
      ),
      u = 0,
      i = "__p+='";
    n.replace(e, function (t, r, e, o, a) {
      return (
        (i += n.slice(u, a).replace(D, L)),
        (u = a + t.length),
        r
          ? (i += "'+\n((__t=(" + r + "))==null?'':_.escape(__t))+\n'")
          : e
            ? (i += "'+\n((__t=(" + e + "))==null?'':__t)+\n'")
            : o && (i += "';\n" + o + "\n__p+='"),
        t
      );
    }),
      (i += "';\n"),
      t.variable || (i = "with(obj||{}){\n" + i + "}\n"),
      (i =
        "var __t,__p='',__j=Array.prototype.join," +
        "print=function(){__p+=__j.call(arguments,'');};\n" +
        i +
        "return __p;\n");
    try {
      var o = new Function(t.variable || "obj", "_", i);
    } catch (a) {
      throw ((a.source = i), a);
    }
    var c = function (n) {
        return o.call(this, n, m);
      },
      f = t.variable || "obj";
    return (c.source = "function(" + f + "){\n" + i + "}"), c;
  }),
    (m.chain = function (n) {
      var t = m(n);
      return (t._chain = !0), t;
    });
  var P = function (n, t) {
    return n._chain ? m(t).chain() : t;
  };
  (m.mixin = function (n) {
    m.each(m.functions(n), function (t) {
      var r = (m[t] = n[t]);
      m.prototype[t] = function () {
        var n = [this._wrapped];
        return f.apply(n, arguments), P(this, r.apply(m, n));
      };
    });
  }),
    m.mixin(m),
    m.each(
      ["pop", "push", "reverse", "shift", "sort", "splice", "unshift"],
      function (n) {
        var t = o[n];
        m.prototype[n] = function () {
          var r = this._wrapped;
          return (
            t.apply(r, arguments),
            ("shift" !== n && "splice" !== n) || 0 !== r.length || delete r[0],
            P(this, r)
          );
        };
      }
    ),
    m.each(["concat", "join", "slice"], function (n) {
      var t = o[n];
      m.prototype[n] = function () {
        return P(this, t.apply(this._wrapped, arguments));
      };
    }),
    (m.prototype.value = function () {
      return this._wrapped;
    }),
    (m.prototype.valueOf = m.prototype.toJSON = m.prototype.value),
    (m.prototype.toString = function () {
      return "" + this._wrapped;
    }),
    "function" == typeof define &&
      define.amd &&
      define("underscore", [], function () {
        return m;
      });
}).call(this);

//! moment.js
//! version : 2.18.1
//! authors : Tim Wood, Iskren Chernev, Moment.js contributors
//! license : MIT
//! momentjs.com
!(function (a, b) {
  "object" == typeof exports && "undefined" != typeof module
    ? (module.exports = b())
    : "function" == typeof define && define.amd
      ? define(b)
      : (a.moment = b());
})(this, function () {
  "use strict";
  function a() {
    return sd.apply(null, arguments);
  }
  function b(a) {
    sd = a;
  }
  function c(a) {
    return (
      a instanceof Array ||
      "[object Array]" === Object.prototype.toString.call(a)
    );
  }
  function d(a) {
    return null != a && "[object Object]" === Object.prototype.toString.call(a);
  }
  function e(a) {
    var b;
    for (b in a) return !1;
    return !0;
  }
  function f(a) {
    return void 0 === a;
  }
  function g(a) {
    return (
      "number" == typeof a ||
      "[object Number]" === Object.prototype.toString.call(a)
    );
  }
  function h(a) {
    return (
      a instanceof Date || "[object Date]" === Object.prototype.toString.call(a)
    );
  }
  function i(a, b) {
    var c,
      d = [];
    for (c = 0; c < a.length; ++c) d.push(b(a[c], c));
    return d;
  }
  function j(a, b) {
    return Object.prototype.hasOwnProperty.call(a, b);
  }
  function k(a, b) {
    for (var c in b) j(b, c) && (a[c] = b[c]);
    return (
      j(b, "toString") && (a.toString = b.toString),
      j(b, "valueOf") && (a.valueOf = b.valueOf),
      a
    );
  }
  function l(a, b, c, d) {
    return sb(a, b, c, d, !0).utc();
  }
  function m() {
    return {
      empty: !1,
      unusedTokens: [],
      unusedInput: [],
      overflow: -2,
      charsLeftOver: 0,
      nullInput: !1,
      invalidMonth: null,
      invalidFormat: !1,
      userInvalidated: !1,
      iso: !1,
      parsedDateParts: [],
      meridiem: null,
      rfc2822: !1,
      weekdayMismatch: !1,
    };
  }
  function n(a) {
    return null == a._pf && (a._pf = m()), a._pf;
  }
  function o(a) {
    if (null == a._isValid) {
      var b = n(a),
        c = ud.call(b.parsedDateParts, function (a) {
          return null != a;
        }),
        d =
          !isNaN(a._d.getTime()) &&
          b.overflow < 0 &&
          !b.empty &&
          !b.invalidMonth &&
          !b.invalidWeekday &&
          !b.nullInput &&
          !b.invalidFormat &&
          !b.userInvalidated &&
          (!b.meridiem || (b.meridiem && c));
      if (
        (a._strict &&
          (d =
            d &&
            0 === b.charsLeftOver &&
            0 === b.unusedTokens.length &&
            void 0 === b.bigHour),
        null != Object.isFrozen && Object.isFrozen(a))
      )
        return d;
      a._isValid = d;
    }
    return a._isValid;
  }
  function p(a) {
    var b = l(NaN);
    return null != a ? k(n(b), a) : (n(b).userInvalidated = !0), b;
  }
  function q(a, b) {
    var c, d, e;
    if (
      (f(b._isAMomentObject) || (a._isAMomentObject = b._isAMomentObject),
      f(b._i) || (a._i = b._i),
      f(b._f) || (a._f = b._f),
      f(b._l) || (a._l = b._l),
      f(b._strict) || (a._strict = b._strict),
      f(b._tzm) || (a._tzm = b._tzm),
      f(b._isUTC) || (a._isUTC = b._isUTC),
      f(b._offset) || (a._offset = b._offset),
      f(b._pf) || (a._pf = n(b)),
      f(b._locale) || (a._locale = b._locale),
      vd.length > 0)
    )
      for (c = 0; c < vd.length; c++)
        (d = vd[c]), (e = b[d]), f(e) || (a[d] = e);
    return a;
  }
  function r(b) {
    q(this, b),
      (this._d = new Date(null != b._d ? b._d.getTime() : NaN)),
      this.isValid() || (this._d = new Date(NaN)),
      wd === !1 && ((wd = !0), a.updateOffset(this), (wd = !1));
  }
  function s(a) {
    return a instanceof r || (null != a && null != a._isAMomentObject);
  }
  function t(a) {
    return a < 0 ? Math.ceil(a) || 0 : Math.floor(a);
  }
  function u(a) {
    var b = +a,
      c = 0;
    return 0 !== b && isFinite(b) && (c = t(b)), c;
  }
  function v(a, b, c) {
    var d,
      e = Math.min(a.length, b.length),
      f = Math.abs(a.length - b.length),
      g = 0;
    for (d = 0; d < e; d++)
      ((c && a[d] !== b[d]) || (!c && u(a[d]) !== u(b[d]))) && g++;
    return g + f;
  }
  function w(b) {
    a.suppressDeprecationWarnings === !1 &&
      "undefined" != typeof console &&
      console.warn &&
      console.warn("Deprecation warning: " + b);
  }
  function x(b, c) {
    var d = !0;
    return k(function () {
      if ((null != a.deprecationHandler && a.deprecationHandler(null, b), d)) {
        for (var e, f = [], g = 0; g < arguments.length; g++) {
          if (((e = ""), "object" == typeof arguments[g])) {
            e += "\n[" + g + "] ";
            for (var h in arguments[0]) e += h + ": " + arguments[0][h] + ", ";
            e = e.slice(0, -2);
          } else e = arguments[g];
          f.push(e);
        }
        w(
          b +
            "\nArguments: " +
            Array.prototype.slice.call(f).join("") +
            "\n" +
            new Error().stack
        ),
          (d = !1);
      }
      return c.apply(this, arguments);
    }, c);
  }
  function y(b, c) {
    null != a.deprecationHandler && a.deprecationHandler(b, c),
      xd[b] || (w(c), (xd[b] = !0));
  }
  function z(a) {
    return (
      a instanceof Function ||
      "[object Function]" === Object.prototype.toString.call(a)
    );
  }
  function A(a) {
    var b, c;
    for (c in a) (b = a[c]), z(b) ? (this[c] = b) : (this["_" + c] = b);
    (this._config = a),
      (this._dayOfMonthOrdinalParseLenient = new RegExp(
        (this._dayOfMonthOrdinalParse.source || this._ordinalParse.source) +
          "|" +
          /\d{1,2}/.source
      ));
  }
  function B(a, b) {
    var c,
      e = k({}, a);
    for (c in b)
      j(b, c) &&
        (d(a[c]) && d(b[c])
          ? ((e[c] = {}), k(e[c], a[c]), k(e[c], b[c]))
          : null != b[c]
            ? (e[c] = b[c])
            : delete e[c]);
    for (c in a) j(a, c) && !j(b, c) && d(a[c]) && (e[c] = k({}, e[c]));
    return e;
  }
  function C(a) {
    null != a && this.set(a);
  }
  function D(a, b, c) {
    var d = this._calendar[a] || this._calendar.sameElse;
    return z(d) ? d.call(b, c) : d;
  }
  function E(a) {
    var b = this._longDateFormat[a],
      c = this._longDateFormat[a.toUpperCase()];
    return b || !c
      ? b
      : ((this._longDateFormat[a] = c.replace(/MMMM|MM|DD|dddd/g, function (a) {
          return a.slice(1);
        })),
        this._longDateFormat[a]);
  }
  function F() {
    return this._invalidDate;
  }
  function G(a) {
    return this._ordinal.replace("%d", a);
  }
  function H(a, b, c, d) {
    var e = this._relativeTime[c];
    return z(e) ? e(a, b, c, d) : e.replace(/%d/i, a);
  }
  function I(a, b) {
    var c = this._relativeTime[a > 0 ? "future" : "past"];
    return z(c) ? c(b) : c.replace(/%s/i, b);
  }
  function J(a, b) {
    var c = a.toLowerCase();
    Hd[c] = Hd[c + "s"] = Hd[b] = a;
  }
  function K(a) {
    return "string" == typeof a ? Hd[a] || Hd[a.toLowerCase()] : void 0;
  }
  function L(a) {
    var b,
      c,
      d = {};
    for (c in a) j(a, c) && ((b = K(c)), b && (d[b] = a[c]));
    return d;
  }
  function M(a, b) {
    Id[a] = b;
  }
  function N(a) {
    var b = [];
    for (var c in a) b.push({ unit: c, priority: Id[c] });
    return (
      b.sort(function (a, b) {
        return a.priority - b.priority;
      }),
      b
    );
  }
  function O(b, c) {
    return function (d) {
      return null != d
        ? (Q(this, b, d), a.updateOffset(this, c), this)
        : P(this, b);
    };
  }
  function P(a, b) {
    return a.isValid() ? a._d["get" + (a._isUTC ? "UTC" : "") + b]() : NaN;
  }
  function Q(a, b, c) {
    a.isValid() && a._d["set" + (a._isUTC ? "UTC" : "") + b](c);
  }
  function R(a) {
    return (a = K(a)), z(this[a]) ? this[a]() : this;
  }
  function S(a, b) {
    if ("object" == typeof a) {
      a = L(a);
      for (var c = N(a), d = 0; d < c.length; d++)
        this[c[d].unit](a[c[d].unit]);
    } else if (((a = K(a)), z(this[a]))) return this[a](b);
    return this;
  }
  function T(a, b, c) {
    var d = "" + Math.abs(a),
      e = b - d.length,
      f = a >= 0;
    return (
      (f ? (c ? "+" : "") : "-") +
      Math.pow(10, Math.max(0, e)).toString().substr(1) +
      d
    );
  }
  function U(a, b, c, d) {
    var e = d;
    "string" == typeof d &&
      (e = function () {
        return this[d]();
      }),
      a && (Md[a] = e),
      b &&
        (Md[b[0]] = function () {
          return T(e.apply(this, arguments), b[1], b[2]);
        }),
      c &&
        (Md[c] = function () {
          return this.localeData().ordinal(e.apply(this, arguments), a);
        });
  }
  function V(a) {
    return a.match(/\[[\s\S]/)
      ? a.replace(/^\[|\]$/g, "")
      : a.replace(/\\/g, "");
  }
  function W(a) {
    var b,
      c,
      d = a.match(Jd);
    for (b = 0, c = d.length; b < c; b++)
      Md[d[b]] ? (d[b] = Md[d[b]]) : (d[b] = V(d[b]));
    return function (b) {
      var e,
        f = "";
      for (e = 0; e < c; e++) f += z(d[e]) ? d[e].call(b, a) : d[e];
      return f;
    };
  }
  function X(a, b) {
    return a.isValid()
      ? ((b = Y(b, a.localeData())), (Ld[b] = Ld[b] || W(b)), Ld[b](a))
      : a.localeData().invalidDate();
  }
  function Y(a, b) {
    function c(a) {
      return b.longDateFormat(a) || a;
    }
    var d = 5;
    for (Kd.lastIndex = 0; d >= 0 && Kd.test(a); )
      (a = a.replace(Kd, c)), (Kd.lastIndex = 0), (d -= 1);
    return a;
  }
  function Z(a, b, c) {
    ce[a] = z(b)
      ? b
      : function (a, d) {
          return a && c ? c : b;
        };
  }
  function $(a, b) {
    return j(ce, a) ? ce[a](b._strict, b._locale) : new RegExp(_(a));
  }
  function _(a) {
    return aa(
      a
        .replace("\\", "")
        .replace(
          /\\(\[)|\\(\])|\[([^\]\[]*)\]|\\(.)/g,
          function (a, b, c, d, e) {
            return b || c || d || e;
          }
        )
    );
  }
  function aa(a) {
    return a.replace(/[-\/\\^$*+?.()|[\]{}]/g, "\\$&");
  }
  function ba(a, b) {
    var c,
      d = b;
    for (
      "string" == typeof a && (a = [a]),
        g(b) &&
          (d = function (a, c) {
            c[b] = u(a);
          }),
        c = 0;
      c < a.length;
      c++
    )
      de[a[c]] = d;
  }
  function ca(a, b) {
    ba(a, function (a, c, d, e) {
      (d._w = d._w || {}), b(a, d._w, d, e);
    });
  }
  function da(a, b, c) {
    null != b && j(de, a) && de[a](b, c._a, c, a);
  }
  function ea(a, b) {
    return new Date(Date.UTC(a, b + 1, 0)).getUTCDate();
  }
  function fa(a, b) {
    return a
      ? c(this._months)
        ? this._months[a.month()]
        : this._months[
            (this._months.isFormat || oe).test(b) ? "format" : "standalone"
          ][a.month()]
      : c(this._months)
        ? this._months
        : this._months.standalone;
  }
  function ga(a, b) {
    return a
      ? c(this._monthsShort)
        ? this._monthsShort[a.month()]
        : this._monthsShort[oe.test(b) ? "format" : "standalone"][a.month()]
      : c(this._monthsShort)
        ? this._monthsShort
        : this._monthsShort.standalone;
  }
  function ha(a, b, c) {
    var d,
      e,
      f,
      g = a.toLocaleLowerCase();
    if (!this._monthsParse)
      for (
        this._monthsParse = [],
          this._longMonthsParse = [],
          this._shortMonthsParse = [],
          d = 0;
        d < 12;
        ++d
      )
        (f = l([2e3, d])),
          (this._shortMonthsParse[d] = this.monthsShort(
            f,
            ""
          ).toLocaleLowerCase()),
          (this._longMonthsParse[d] = this.months(f, "").toLocaleLowerCase());
    return c
      ? "MMM" === b
        ? ((e = ne.call(this._shortMonthsParse, g)), e !== -1 ? e : null)
        : ((e = ne.call(this._longMonthsParse, g)), e !== -1 ? e : null)
      : "MMM" === b
        ? ((e = ne.call(this._shortMonthsParse, g)),
          e !== -1
            ? e
            : ((e = ne.call(this._longMonthsParse, g)), e !== -1 ? e : null))
        : ((e = ne.call(this._longMonthsParse, g)),
          e !== -1
            ? e
            : ((e = ne.call(this._shortMonthsParse, g)), e !== -1 ? e : null));
  }
  function ia(a, b, c) {
    var d, e, f;
    if (this._monthsParseExact) return ha.call(this, a, b, c);
    for (
      this._monthsParse ||
        ((this._monthsParse = []),
        (this._longMonthsParse = []),
        (this._shortMonthsParse = [])),
        d = 0;
      d < 12;
      d++
    ) {
      if (
        ((e = l([2e3, d])),
        c &&
          !this._longMonthsParse[d] &&
          ((this._longMonthsParse[d] = new RegExp(
            "^" + this.months(e, "").replace(".", "") + "$",
            "i"
          )),
          (this._shortMonthsParse[d] = new RegExp(
            "^" + this.monthsShort(e, "").replace(".", "") + "$",
            "i"
          ))),
        c ||
          this._monthsParse[d] ||
          ((f = "^" + this.months(e, "") + "|^" + this.monthsShort(e, "")),
          (this._monthsParse[d] = new RegExp(f.replace(".", ""), "i"))),
        c && "MMMM" === b && this._longMonthsParse[d].test(a))
      )
        return d;
      if (c && "MMM" === b && this._shortMonthsParse[d].test(a)) return d;
      if (!c && this._monthsParse[d].test(a)) return d;
    }
  }
  function ja(a, b) {
    var c;
    if (!a.isValid()) return a;
    if ("string" == typeof b)
      if (/^\d+$/.test(b)) b = u(b);
      else if (((b = a.localeData().monthsParse(b)), !g(b))) return a;
    return (
      (c = Math.min(a.date(), ea(a.year(), b))),
      a._d["set" + (a._isUTC ? "UTC" : "") + "Month"](b, c),
      a
    );
  }
  function ka(b) {
    return null != b
      ? (ja(this, b), a.updateOffset(this, !0), this)
      : P(this, "Month");
  }
  function la() {
    return ea(this.year(), this.month());
  }
  function ma(a) {
    return this._monthsParseExact
      ? (j(this, "_monthsRegex") || oa.call(this),
        a ? this._monthsShortStrictRegex : this._monthsShortRegex)
      : (j(this, "_monthsShortRegex") || (this._monthsShortRegex = re),
        this._monthsShortStrictRegex && a
          ? this._monthsShortStrictRegex
          : this._monthsShortRegex);
  }
  function na(a) {
    return this._monthsParseExact
      ? (j(this, "_monthsRegex") || oa.call(this),
        a ? this._monthsStrictRegex : this._monthsRegex)
      : (j(this, "_monthsRegex") || (this._monthsRegex = se),
        this._monthsStrictRegex && a
          ? this._monthsStrictRegex
          : this._monthsRegex);
  }
  function oa() {
    function a(a, b) {
      return b.length - a.length;
    }
    var b,
      c,
      d = [],
      e = [],
      f = [];
    for (b = 0; b < 12; b++)
      (c = l([2e3, b])),
        d.push(this.monthsShort(c, "")),
        e.push(this.months(c, "")),
        f.push(this.months(c, "")),
        f.push(this.monthsShort(c, ""));
    for (d.sort(a), e.sort(a), f.sort(a), b = 0; b < 12; b++)
      (d[b] = aa(d[b])), (e[b] = aa(e[b]));
    for (b = 0; b < 24; b++) f[b] = aa(f[b]);
    (this._monthsRegex = new RegExp("^(" + f.join("|") + ")", "i")),
      (this._monthsShortRegex = this._monthsRegex),
      (this._monthsStrictRegex = new RegExp("^(" + e.join("|") + ")", "i")),
      (this._monthsShortStrictRegex = new RegExp(
        "^(" + d.join("|") + ")",
        "i"
      ));
  }
  function pa(a) {
    return qa(a) ? 366 : 365;
  }
  function qa(a) {
    return (a % 4 === 0 && a % 100 !== 0) || a % 400 === 0;
  }
  function ra() {
    return qa(this.year());
  }
  function sa(a, b, c, d, e, f, g) {
    var h = new Date(a, b, c, d, e, f, g);
    return (
      a < 100 && a >= 0 && isFinite(h.getFullYear()) && h.setFullYear(a), h
    );
  }
  function ta(a) {
    var b = new Date(Date.UTC.apply(null, arguments));
    return (
      a < 100 && a >= 0 && isFinite(b.getUTCFullYear()) && b.setUTCFullYear(a),
      b
    );
  }
  function ua(a, b, c) {
    var d = 7 + b - c,
      e = (7 + ta(a, 0, d).getUTCDay() - b) % 7;
    return -e + d - 1;
  }
  function va(a, b, c, d, e) {
    var f,
      g,
      h = (7 + c - d) % 7,
      i = ua(a, d, e),
      j = 1 + 7 * (b - 1) + h + i;
    return (
      j <= 0
        ? ((f = a - 1), (g = pa(f) + j))
        : j > pa(a)
          ? ((f = a + 1), (g = j - pa(a)))
          : ((f = a), (g = j)),
      { year: f, dayOfYear: g }
    );
  }
  function wa(a, b, c) {
    var d,
      e,
      f = ua(a.year(), b, c),
      g = Math.floor((a.dayOfYear() - f - 1) / 7) + 1;
    return (
      g < 1
        ? ((e = a.year() - 1), (d = g + xa(e, b, c)))
        : g > xa(a.year(), b, c)
          ? ((d = g - xa(a.year(), b, c)), (e = a.year() + 1))
          : ((e = a.year()), (d = g)),
      { week: d, year: e }
    );
  }
  function xa(a, b, c) {
    var d = ua(a, b, c),
      e = ua(a + 1, b, c);
    return (pa(a) - d + e) / 7;
  }
  function ya(a) {
    return wa(a, this._week.dow, this._week.doy).week;
  }
  function za() {
    return this._week.dow;
  }
  function Aa() {
    return this._week.doy;
  }
  function Ba(a) {
    var b = this.localeData().week(this);
    return null == a ? b : this.add(7 * (a - b), "d");
  }
  function Ca(a) {
    var b = wa(this, 1, 4).week;
    return null == a ? b : this.add(7 * (a - b), "d");
  }
  function Da(a, b) {
    return "string" != typeof a
      ? a
      : isNaN(a)
        ? ((a = b.weekdaysParse(a)), "number" == typeof a ? a : null)
        : parseInt(a, 10);
  }
  function Ea(a, b) {
    return "string" == typeof a
      ? b.weekdaysParse(a) % 7 || 7
      : isNaN(a)
        ? null
        : a;
  }
  function Fa(a, b) {
    return a
      ? c(this._weekdays)
        ? this._weekdays[a.day()]
        : this._weekdays[
            this._weekdays.isFormat.test(b) ? "format" : "standalone"
          ][a.day()]
      : c(this._weekdays)
        ? this._weekdays
        : this._weekdays.standalone;
  }
  function Ga(a) {
    return a ? this._weekdaysShort[a.day()] : this._weekdaysShort;
  }
  function Ha(a) {
    return a ? this._weekdaysMin[a.day()] : this._weekdaysMin;
  }
  function Ia(a, b, c) {
    var d,
      e,
      f,
      g = a.toLocaleLowerCase();
    if (!this._weekdaysParse)
      for (
        this._weekdaysParse = [],
          this._shortWeekdaysParse = [],
          this._minWeekdaysParse = [],
          d = 0;
        d < 7;
        ++d
      )
        (f = l([2e3, 1]).day(d)),
          (this._minWeekdaysParse[d] = this.weekdaysMin(
            f,
            ""
          ).toLocaleLowerCase()),
          (this._shortWeekdaysParse[d] = this.weekdaysShort(
            f,
            ""
          ).toLocaleLowerCase()),
          (this._weekdaysParse[d] = this.weekdays(f, "").toLocaleLowerCase());
    return c
      ? "dddd" === b
        ? ((e = ne.call(this._weekdaysParse, g)), e !== -1 ? e : null)
        : "ddd" === b
          ? ((e = ne.call(this._shortWeekdaysParse, g)), e !== -1 ? e : null)
          : ((e = ne.call(this._minWeekdaysParse, g)), e !== -1 ? e : null)
      : "dddd" === b
        ? ((e = ne.call(this._weekdaysParse, g)),
          e !== -1
            ? e
            : ((e = ne.call(this._shortWeekdaysParse, g)),
              e !== -1
                ? e
                : ((e = ne.call(this._minWeekdaysParse, g)),
                  e !== -1 ? e : null)))
        : "ddd" === b
          ? ((e = ne.call(this._shortWeekdaysParse, g)),
            e !== -1
              ? e
              : ((e = ne.call(this._weekdaysParse, g)),
                e !== -1
                  ? e
                  : ((e = ne.call(this._minWeekdaysParse, g)),
                    e !== -1 ? e : null)))
          : ((e = ne.call(this._minWeekdaysParse, g)),
            e !== -1
              ? e
              : ((e = ne.call(this._weekdaysParse, g)),
                e !== -1
                  ? e
                  : ((e = ne.call(this._shortWeekdaysParse, g)),
                    e !== -1 ? e : null)));
  }
  function Ja(a, b, c) {
    var d, e, f;
    if (this._weekdaysParseExact) return Ia.call(this, a, b, c);
    for (
      this._weekdaysParse ||
        ((this._weekdaysParse = []),
        (this._minWeekdaysParse = []),
        (this._shortWeekdaysParse = []),
        (this._fullWeekdaysParse = [])),
        d = 0;
      d < 7;
      d++
    ) {
      if (
        ((e = l([2e3, 1]).day(d)),
        c &&
          !this._fullWeekdaysParse[d] &&
          ((this._fullWeekdaysParse[d] = new RegExp(
            "^" + this.weekdays(e, "").replace(".", ".?") + "$",
            "i"
          )),
          (this._shortWeekdaysParse[d] = new RegExp(
            "^" + this.weekdaysShort(e, "").replace(".", ".?") + "$",
            "i"
          )),
          (this._minWeekdaysParse[d] = new RegExp(
            "^" + this.weekdaysMin(e, "").replace(".", ".?") + "$",
            "i"
          ))),
        this._weekdaysParse[d] ||
          ((f =
            "^" +
            this.weekdays(e, "") +
            "|^" +
            this.weekdaysShort(e, "") +
            "|^" +
            this.weekdaysMin(e, "")),
          (this._weekdaysParse[d] = new RegExp(f.replace(".", ""), "i"))),
        c && "dddd" === b && this._fullWeekdaysParse[d].test(a))
      )
        return d;
      if (c && "ddd" === b && this._shortWeekdaysParse[d].test(a)) return d;
      if (c && "dd" === b && this._minWeekdaysParse[d].test(a)) return d;
      if (!c && this._weekdaysParse[d].test(a)) return d;
    }
  }
  function Ka(a) {
    if (!this.isValid()) return null != a ? this : NaN;
    var b = this._isUTC ? this._d.getUTCDay() : this._d.getDay();
    return null != a
      ? ((a = Da(a, this.localeData())), this.add(a - b, "d"))
      : b;
  }
  function La(a) {
    if (!this.isValid()) return null != a ? this : NaN;
    var b = (this.day() + 7 - this.localeData()._week.dow) % 7;
    return null == a ? b : this.add(a - b, "d");
  }
  function Ma(a) {
    if (!this.isValid()) return null != a ? this : NaN;
    if (null != a) {
      var b = Ea(a, this.localeData());
      return this.day(this.day() % 7 ? b : b - 7);
    }
    return this.day() || 7;
  }
  function Na(a) {
    return this._weekdaysParseExact
      ? (j(this, "_weekdaysRegex") || Qa.call(this),
        a ? this._weekdaysStrictRegex : this._weekdaysRegex)
      : (j(this, "_weekdaysRegex") || (this._weekdaysRegex = ye),
        this._weekdaysStrictRegex && a
          ? this._weekdaysStrictRegex
          : this._weekdaysRegex);
  }
  function Oa(a) {
    return this._weekdaysParseExact
      ? (j(this, "_weekdaysRegex") || Qa.call(this),
        a ? this._weekdaysShortStrictRegex : this._weekdaysShortRegex)
      : (j(this, "_weekdaysShortRegex") || (this._weekdaysShortRegex = ze),
        this._weekdaysShortStrictRegex && a
          ? this._weekdaysShortStrictRegex
          : this._weekdaysShortRegex);
  }
  function Pa(a) {
    return this._weekdaysParseExact
      ? (j(this, "_weekdaysRegex") || Qa.call(this),
        a ? this._weekdaysMinStrictRegex : this._weekdaysMinRegex)
      : (j(this, "_weekdaysMinRegex") || (this._weekdaysMinRegex = Ae),
        this._weekdaysMinStrictRegex && a
          ? this._weekdaysMinStrictRegex
          : this._weekdaysMinRegex);
  }
  function Qa() {
    function a(a, b) {
      return b.length - a.length;
    }
    var b,
      c,
      d,
      e,
      f,
      g = [],
      h = [],
      i = [],
      j = [];
    for (b = 0; b < 7; b++)
      (c = l([2e3, 1]).day(b)),
        (d = this.weekdaysMin(c, "")),
        (e = this.weekdaysShort(c, "")),
        (f = this.weekdays(c, "")),
        g.push(d),
        h.push(e),
        i.push(f),
        j.push(d),
        j.push(e),
        j.push(f);
    for (g.sort(a), h.sort(a), i.sort(a), j.sort(a), b = 0; b < 7; b++)
      (h[b] = aa(h[b])), (i[b] = aa(i[b])), (j[b] = aa(j[b]));
    (this._weekdaysRegex = new RegExp("^(" + j.join("|") + ")", "i")),
      (this._weekdaysShortRegex = this._weekdaysRegex),
      (this._weekdaysMinRegex = this._weekdaysRegex),
      (this._weekdaysStrictRegex = new RegExp("^(" + i.join("|") + ")", "i")),
      (this._weekdaysShortStrictRegex = new RegExp(
        "^(" + h.join("|") + ")",
        "i"
      )),
      (this._weekdaysMinStrictRegex = new RegExp(
        "^(" + g.join("|") + ")",
        "i"
      ));
  }
  function Ra() {
    return this.hours() % 12 || 12;
  }
  function Sa() {
    return this.hours() || 24;
  }
  function Ta(a, b) {
    U(a, 0, 0, function () {
      return this.localeData().meridiem(this.hours(), this.minutes(), b);
    });
  }
  function Ua(a, b) {
    return b._meridiemParse;
  }
  function Va(a) {
    return "p" === (a + "").toLowerCase().charAt(0);
  }
  function Wa(a, b, c) {
    return a > 11 ? (c ? "pm" : "PM") : c ? "am" : "AM";
  }
  function Xa(a) {
    return a ? a.toLowerCase().replace("_", "-") : a;
  }
  function Ya(a) {
    for (var b, c, d, e, f = 0; f < a.length; ) {
      for (
        e = Xa(a[f]).split("-"),
          b = e.length,
          c = Xa(a[f + 1]),
          c = c ? c.split("-") : null;
        b > 0;

      ) {
        if ((d = Za(e.slice(0, b).join("-")))) return d;
        if (c && c.length >= b && v(e, c, !0) >= b - 1) break;
        b--;
      }
      f++;
    }
    return null;
  }
  function Za(a) {
    var b = null;
    if (!Fe[a] && "undefined" != typeof module && module && module.exports)
      try {
        (b = Be._abbr), require("./locale/" + a), $a(b);
      } catch (a) {}
    return Fe[a];
  }
  function $a(a, b) {
    var c;
    return a && ((c = f(b) ? bb(a) : _a(a, b)), c && (Be = c)), Be._abbr;
  }
  function _a(a, b) {
    if (null !== b) {
      var c = Ee;
      if (((b.abbr = a), null != Fe[a]))
        y(
          "defineLocaleOverride",
          "use moment.updateLocale(localeName, config) to change an existing locale. moment.defineLocale(localeName, config) should only be used for creating a new locale See http://momentjs.com/guides/#/warnings/define-locale/ for more info."
        ),
          (c = Fe[a]._config);
      else if (null != b.parentLocale) {
        if (null == Fe[b.parentLocale])
          return (
            Ge[b.parentLocale] || (Ge[b.parentLocale] = []),
            Ge[b.parentLocale].push({ name: a, config: b }),
            null
          );
        c = Fe[b.parentLocale]._config;
      }
      return (
        (Fe[a] = new C(B(c, b))),
        Ge[a] &&
          Ge[a].forEach(function (a) {
            _a(a.name, a.config);
          }),
        $a(a),
        Fe[a]
      );
    }
    return delete Fe[a], null;
  }
  function ab(a, b) {
    if (null != b) {
      var c,
        d = Ee;
      null != Fe[a] && (d = Fe[a]._config),
        (b = B(d, b)),
        (c = new C(b)),
        (c.parentLocale = Fe[a]),
        (Fe[a] = c),
        $a(a);
    } else
      null != Fe[a] &&
        (null != Fe[a].parentLocale
          ? (Fe[a] = Fe[a].parentLocale)
          : null != Fe[a] && delete Fe[a]);
    return Fe[a];
  }
  function bb(a) {
    var b;
    if ((a && a._locale && a._locale._abbr && (a = a._locale._abbr), !a))
      return Be;
    if (!c(a)) {
      if ((b = Za(a))) return b;
      a = [a];
    }
    return Ya(a);
  }
  function cb() {
    return Ad(Fe);
  }
  function db(a) {
    var b,
      c = a._a;
    return (
      c &&
        n(a).overflow === -2 &&
        ((b =
          c[fe] < 0 || c[fe] > 11
            ? fe
            : c[ge] < 1 || c[ge] > ea(c[ee], c[fe])
              ? ge
              : c[he] < 0 ||
                  c[he] > 24 ||
                  (24 === c[he] && (0 !== c[ie] || 0 !== c[je] || 0 !== c[ke]))
                ? he
                : c[ie] < 0 || c[ie] > 59
                  ? ie
                  : c[je] < 0 || c[je] > 59
                    ? je
                    : c[ke] < 0 || c[ke] > 999
                      ? ke
                      : -1),
        n(a)._overflowDayOfYear && (b < ee || b > ge) && (b = ge),
        n(a)._overflowWeeks && b === -1 && (b = le),
        n(a)._overflowWeekday && b === -1 && (b = me),
        (n(a).overflow = b)),
      a
    );
  }
  function eb(a) {
    var b,
      c,
      d,
      e,
      f,
      g,
      h = a._i,
      i = He.exec(h) || Ie.exec(h);
    if (i) {
      for (n(a).iso = !0, b = 0, c = Ke.length; b < c; b++)
        if (Ke[b][1].exec(i[1])) {
          (e = Ke[b][0]), (d = Ke[b][2] !== !1);
          break;
        }
      if (null == e) return void (a._isValid = !1);
      if (i[3]) {
        for (b = 0, c = Le.length; b < c; b++)
          if (Le[b][1].exec(i[3])) {
            f = (i[2] || " ") + Le[b][0];
            break;
          }
        if (null == f) return void (a._isValid = !1);
      }
      if (!d && null != f) return void (a._isValid = !1);
      if (i[4]) {
        if (!Je.exec(i[4])) return void (a._isValid = !1);
        g = "Z";
      }
      (a._f = e + (f || "") + (g || "")), lb(a);
    } else a._isValid = !1;
  }
  function fb(a) {
    var b,
      c,
      d,
      e,
      f,
      g,
      h,
      i,
      j = {
        " GMT": " +0000",
        " EDT": " -0400",
        " EST": " -0500",
        " CDT": " -0500",
        " CST": " -0600",
        " MDT": " -0600",
        " MST": " -0700",
        " PDT": " -0700",
        " PST": " -0800",
      },
      k = "YXWVUTSRQPONZABCDEFGHIKLM";
    if (
      ((b = a._i
        .replace(/\([^\)]*\)|[\n\t]/g, " ")
        .replace(/(\s\s+)/g, " ")
        .replace(/^\s|\s$/g, "")),
      (c = Ne.exec(b)))
    ) {
      if (
        ((d = c[1] ? "ddd" + (5 === c[1].length ? ", " : " ") : ""),
        (e = "D MMM " + (c[2].length > 10 ? "YYYY " : "YY ")),
        (f = "HH:mm" + (c[4] ? ":ss" : "")),
        c[1])
      ) {
        var l = new Date(c[2]),
          m = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"][l.getDay()];
        if (c[1].substr(0, 3) !== m)
          return (n(a).weekdayMismatch = !0), void (a._isValid = !1);
      }
      switch (c[5].length) {
        case 2:
          0 === i
            ? (h = " +0000")
            : ((i = k.indexOf(c[5][1].toUpperCase()) - 12),
              (h =
                (i < 0 ? " -" : " +") +
                ("" + i).replace(/^-?/, "0").match(/..$/)[0] +
                "00"));
          break;
        case 4:
          h = j[c[5]];
          break;
        default:
          h = j[" GMT"];
      }
      (c[5] = h),
        (a._i = c.splice(1).join("")),
        (g = " ZZ"),
        (a._f = d + e + f + g),
        lb(a),
        (n(a).rfc2822 = !0);
    } else a._isValid = !1;
  }
  function gb(b) {
    var c = Me.exec(b._i);
    return null !== c
      ? void (b._d = new Date(+c[1]))
      : (eb(b),
        void (
          b._isValid === !1 &&
          (delete b._isValid,
          fb(b),
          b._isValid === !1 &&
            (delete b._isValid, a.createFromInputFallback(b)))
        ));
  }
  function hb(a, b, c) {
    return null != a ? a : null != b ? b : c;
  }
  function ib(b) {
    var c = new Date(a.now());
    return b._useUTC
      ? [c.getUTCFullYear(), c.getUTCMonth(), c.getUTCDate()]
      : [c.getFullYear(), c.getMonth(), c.getDate()];
  }
  function jb(a) {
    var b,
      c,
      d,
      e,
      f = [];
    if (!a._d) {
      for (
        d = ib(a),
          a._w && null == a._a[ge] && null == a._a[fe] && kb(a),
          null != a._dayOfYear &&
            ((e = hb(a._a[ee], d[ee])),
            (a._dayOfYear > pa(e) || 0 === a._dayOfYear) &&
              (n(a)._overflowDayOfYear = !0),
            (c = ta(e, 0, a._dayOfYear)),
            (a._a[fe] = c.getUTCMonth()),
            (a._a[ge] = c.getUTCDate())),
          b = 0;
        b < 3 && null == a._a[b];
        ++b
      )
        a._a[b] = f[b] = d[b];
      for (; b < 7; b++)
        a._a[b] = f[b] = null == a._a[b] ? (2 === b ? 1 : 0) : a._a[b];
      24 === a._a[he] &&
        0 === a._a[ie] &&
        0 === a._a[je] &&
        0 === a._a[ke] &&
        ((a._nextDay = !0), (a._a[he] = 0)),
        (a._d = (a._useUTC ? ta : sa).apply(null, f)),
        null != a._tzm && a._d.setUTCMinutes(a._d.getUTCMinutes() - a._tzm),
        a._nextDay && (a._a[he] = 24);
    }
  }
  function kb(a) {
    var b, c, d, e, f, g, h, i;
    if (((b = a._w), null != b.GG || null != b.W || null != b.E))
      (f = 1),
        (g = 4),
        (c = hb(b.GG, a._a[ee], wa(tb(), 1, 4).year)),
        (d = hb(b.W, 1)),
        (e = hb(b.E, 1)),
        (e < 1 || e > 7) && (i = !0);
    else {
      (f = a._locale._week.dow), (g = a._locale._week.doy);
      var j = wa(tb(), f, g);
      (c = hb(b.gg, a._a[ee], j.year)),
        (d = hb(b.w, j.week)),
        null != b.d
          ? ((e = b.d), (e < 0 || e > 6) && (i = !0))
          : null != b.e
            ? ((e = b.e + f), (b.e < 0 || b.e > 6) && (i = !0))
            : (e = f);
    }
    d < 1 || d > xa(c, f, g)
      ? (n(a)._overflowWeeks = !0)
      : null != i
        ? (n(a)._overflowWeekday = !0)
        : ((h = va(c, d, e, f, g)),
          (a._a[ee] = h.year),
          (a._dayOfYear = h.dayOfYear));
  }
  function lb(b) {
    if (b._f === a.ISO_8601) return void eb(b);
    if (b._f === a.RFC_2822) return void fb(b);
    (b._a = []), (n(b).empty = !0);
    var c,
      d,
      e,
      f,
      g,
      h = "" + b._i,
      i = h.length,
      j = 0;
    for (e = Y(b._f, b._locale).match(Jd) || [], c = 0; c < e.length; c++)
      (f = e[c]),
        (d = (h.match($(f, b)) || [])[0]),
        d &&
          ((g = h.substr(0, h.indexOf(d))),
          g.length > 0 && n(b).unusedInput.push(g),
          (h = h.slice(h.indexOf(d) + d.length)),
          (j += d.length)),
        Md[f]
          ? (d ? (n(b).empty = !1) : n(b).unusedTokens.push(f), da(f, d, b))
          : b._strict && !d && n(b).unusedTokens.push(f);
    (n(b).charsLeftOver = i - j),
      h.length > 0 && n(b).unusedInput.push(h),
      b._a[he] <= 12 &&
        n(b).bigHour === !0 &&
        b._a[he] > 0 &&
        (n(b).bigHour = void 0),
      (n(b).parsedDateParts = b._a.slice(0)),
      (n(b).meridiem = b._meridiem),
      (b._a[he] = mb(b._locale, b._a[he], b._meridiem)),
      jb(b),
      db(b);
  }
  function mb(a, b, c) {
    var d;
    return null == c
      ? b
      : null != a.meridiemHour
        ? a.meridiemHour(b, c)
        : null != a.isPM
          ? ((d = a.isPM(c)),
            d && b < 12 && (b += 12),
            d || 12 !== b || (b = 0),
            b)
          : b;
  }
  function nb(a) {
    var b, c, d, e, f;
    if (0 === a._f.length)
      return (n(a).invalidFormat = !0), void (a._d = new Date(NaN));
    for (e = 0; e < a._f.length; e++)
      (f = 0),
        (b = q({}, a)),
        null != a._useUTC && (b._useUTC = a._useUTC),
        (b._f = a._f[e]),
        lb(b),
        o(b) &&
          ((f += n(b).charsLeftOver),
          (f += 10 * n(b).unusedTokens.length),
          (n(b).score = f),
          (null == d || f < d) && ((d = f), (c = b)));
    k(a, c || b);
  }
  function ob(a) {
    if (!a._d) {
      var b = L(a._i);
      (a._a = i(
        [
          b.year,
          b.month,
          b.day || b.date,
          b.hour,
          b.minute,
          b.second,
          b.millisecond,
        ],
        function (a) {
          return a && parseInt(a, 10);
        }
      )),
        jb(a);
    }
  }
  function pb(a) {
    var b = new r(db(qb(a)));
    return b._nextDay && (b.add(1, "d"), (b._nextDay = void 0)), b;
  }
  function qb(a) {
    var b = a._i,
      d = a._f;
    return (
      (a._locale = a._locale || bb(a._l)),
      null === b || (void 0 === d && "" === b)
        ? p({ nullInput: !0 })
        : ("string" == typeof b && (a._i = b = a._locale.preparse(b)),
          s(b)
            ? new r(db(b))
            : (h(b) ? (a._d = b) : c(d) ? nb(a) : d ? lb(a) : rb(a),
              o(a) || (a._d = null),
              a))
    );
  }
  function rb(b) {
    var e = b._i;
    f(e)
      ? (b._d = new Date(a.now()))
      : h(e)
        ? (b._d = new Date(e.valueOf()))
        : "string" == typeof e
          ? gb(b)
          : c(e)
            ? ((b._a = i(e.slice(0), function (a) {
                return parseInt(a, 10);
              })),
              jb(b))
            : d(e)
              ? ob(b)
              : g(e)
                ? (b._d = new Date(e))
                : a.createFromInputFallback(b);
  }
  function sb(a, b, f, g, h) {
    var i = {};
    return (
      (f !== !0 && f !== !1) || ((g = f), (f = void 0)),
      ((d(a) && e(a)) || (c(a) && 0 === a.length)) && (a = void 0),
      (i._isAMomentObject = !0),
      (i._useUTC = i._isUTC = h),
      (i._l = f),
      (i._i = a),
      (i._f = b),
      (i._strict = g),
      pb(i)
    );
  }
  function tb(a, b, c, d) {
    return sb(a, b, c, d, !1);
  }
  function ub(a, b) {
    var d, e;
    if ((1 === b.length && c(b[0]) && (b = b[0]), !b.length)) return tb();
    for (d = b[0], e = 1; e < b.length; ++e)
      (b[e].isValid() && !b[e][a](d)) || (d = b[e]);
    return d;
  }
  function vb() {
    var a = [].slice.call(arguments, 0);
    return ub("isBefore", a);
  }
  function wb() {
    var a = [].slice.call(arguments, 0);
    return ub("isAfter", a);
  }
  function xb(a) {
    for (var b in a)
      if (Re.indexOf(b) === -1 || (null != a[b] && isNaN(a[b]))) return !1;
    for (var c = !1, d = 0; d < Re.length; ++d)
      if (a[Re[d]]) {
        if (c) return !1;
        parseFloat(a[Re[d]]) !== u(a[Re[d]]) && (c = !0);
      }
    return !0;
  }
  function yb() {
    return this._isValid;
  }
  function zb() {
    return Sb(NaN);
  }
  function Ab(a) {
    var b = L(a),
      c = b.year || 0,
      d = b.quarter || 0,
      e = b.month || 0,
      f = b.week || 0,
      g = b.day || 0,
      h = b.hour || 0,
      i = b.minute || 0,
      j = b.second || 0,
      k = b.millisecond || 0;
    (this._isValid = xb(b)),
      (this._milliseconds = +k + 1e3 * j + 6e4 * i + 1e3 * h * 60 * 60),
      (this._days = +g + 7 * f),
      (this._months = +e + 3 * d + 12 * c),
      (this._data = {}),
      (this._locale = bb()),
      this._bubble();
  }
  function Bb(a) {
    return a instanceof Ab;
  }
  function Cb(a) {
    return a < 0 ? Math.round(-1 * a) * -1 : Math.round(a);
  }
  function Db(a, b) {
    U(a, 0, 0, function () {
      var a = this.utcOffset(),
        c = "+";
      return (
        a < 0 && ((a = -a), (c = "-")),
        c + T(~~(a / 60), 2) + b + T(~~a % 60, 2)
      );
    });
  }
  function Eb(a, b) {
    var c = (b || "").match(a);
    if (null === c) return null;
    var d = c[c.length - 1] || [],
      e = (d + "").match(Se) || ["-", 0, 0],
      f = +(60 * e[1]) + u(e[2]);
    return 0 === f ? 0 : "+" === e[0] ? f : -f;
  }
  function Fb(b, c) {
    var d, e;
    return c._isUTC
      ? ((d = c.clone()),
        (e = (s(b) || h(b) ? b.valueOf() : tb(b).valueOf()) - d.valueOf()),
        d._d.setTime(d._d.valueOf() + e),
        a.updateOffset(d, !1),
        d)
      : tb(b).local();
  }
  function Gb(a) {
    return 15 * -Math.round(a._d.getTimezoneOffset() / 15);
  }
  function Hb(b, c, d) {
    var e,
      f = this._offset || 0;
    if (!this.isValid()) return null != b ? this : NaN;
    if (null != b) {
      if ("string" == typeof b) {
        if (((b = Eb(_d, b)), null === b)) return this;
      } else Math.abs(b) < 16 && !d && (b = 60 * b);
      return (
        !this._isUTC && c && (e = Gb(this)),
        (this._offset = b),
        (this._isUTC = !0),
        null != e && this.add(e, "m"),
        f !== b &&
          (!c || this._changeInProgress
            ? Xb(this, Sb(b - f, "m"), 1, !1)
            : this._changeInProgress ||
              ((this._changeInProgress = !0),
              a.updateOffset(this, !0),
              (this._changeInProgress = null))),
        this
      );
    }
    return this._isUTC ? f : Gb(this);
  }
  function Ib(a, b) {
    return null != a
      ? ("string" != typeof a && (a = -a), this.utcOffset(a, b), this)
      : -this.utcOffset();
  }
  function Jb(a) {
    return this.utcOffset(0, a);
  }
  function Kb(a) {
    return (
      this._isUTC &&
        (this.utcOffset(0, a),
        (this._isUTC = !1),
        a && this.subtract(Gb(this), "m")),
      this
    );
  }
  function Lb() {
    if (null != this._tzm) this.utcOffset(this._tzm, !1, !0);
    else if ("string" == typeof this._i) {
      var a = Eb($d, this._i);
      null != a ? this.utcOffset(a) : this.utcOffset(0, !0);
    }
    return this;
  }
  function Mb(a) {
    return (
      !!this.isValid() &&
      ((a = a ? tb(a).utcOffset() : 0), (this.utcOffset() - a) % 60 === 0)
    );
  }
  function Nb() {
    return (
      this.utcOffset() > this.clone().month(0).utcOffset() ||
      this.utcOffset() > this.clone().month(5).utcOffset()
    );
  }
  function Ob() {
    if (!f(this._isDSTShifted)) return this._isDSTShifted;
    var a = {};
    if ((q(a, this), (a = qb(a)), a._a)) {
      var b = a._isUTC ? l(a._a) : tb(a._a);
      this._isDSTShifted = this.isValid() && v(a._a, b.toArray()) > 0;
    } else this._isDSTShifted = !1;
    return this._isDSTShifted;
  }
  function Pb() {
    return !!this.isValid() && !this._isUTC;
  }
  function Qb() {
    return !!this.isValid() && this._isUTC;
  }
  function Rb() {
    return !!this.isValid() && this._isUTC && 0 === this._offset;
  }
  function Sb(a, b) {
    var c,
      d,
      e,
      f = a,
      h = null;
    return (
      Bb(a)
        ? (f = { ms: a._milliseconds, d: a._days, M: a._months })
        : g(a)
          ? ((f = {}), b ? (f[b] = a) : (f.milliseconds = a))
          : (h = Te.exec(a))
            ? ((c = "-" === h[1] ? -1 : 1),
              (f = {
                y: 0,
                d: u(h[ge]) * c,
                h: u(h[he]) * c,
                m: u(h[ie]) * c,
                s: u(h[je]) * c,
                ms: u(Cb(1e3 * h[ke])) * c,
              }))
            : (h = Ue.exec(a))
              ? ((c = "-" === h[1] ? -1 : 1),
                (f = {
                  y: Tb(h[2], c),
                  M: Tb(h[3], c),
                  w: Tb(h[4], c),
                  d: Tb(h[5], c),
                  h: Tb(h[6], c),
                  m: Tb(h[7], c),
                  s: Tb(h[8], c),
                }))
              : null == f
                ? (f = {})
                : "object" == typeof f &&
                  ("from" in f || "to" in f) &&
                  ((e = Vb(tb(f.from), tb(f.to))),
                  (f = {}),
                  (f.ms = e.milliseconds),
                  (f.M = e.months)),
      (d = new Ab(f)),
      Bb(a) && j(a, "_locale") && (d._locale = a._locale),
      d
    );
  }
  function Tb(a, b) {
    var c = a && parseFloat(a.replace(",", "."));
    return (isNaN(c) ? 0 : c) * b;
  }
  function Ub(a, b) {
    var c = { milliseconds: 0, months: 0 };
    return (
      (c.months = b.month() - a.month() + 12 * (b.year() - a.year())),
      a.clone().add(c.months, "M").isAfter(b) && --c.months,
      (c.milliseconds = +b - +a.clone().add(c.months, "M")),
      c
    );
  }
  function Vb(a, b) {
    var c;
    return a.isValid() && b.isValid()
      ? ((b = Fb(b, a)),
        a.isBefore(b)
          ? (c = Ub(a, b))
          : ((c = Ub(b, a)),
            (c.milliseconds = -c.milliseconds),
            (c.months = -c.months)),
        c)
      : { milliseconds: 0, months: 0 };
  }
  function Wb(a, b) {
    return function (c, d) {
      var e, f;
      return (
        null === d ||
          isNaN(+d) ||
          (y(
            b,
            "moment()." +
              b +
              "(period, number) is deprecated. Please use moment()." +
              b +
              "(number, period). See http://momentjs.com/guides/#/warnings/add-inverted-param/ for more info."
          ),
          (f = c),
          (c = d),
          (d = f)),
        (c = "string" == typeof c ? +c : c),
        (e = Sb(c, d)),
        Xb(this, e, a),
        this
      );
    };
  }
  function Xb(b, c, d, e) {
    var f = c._milliseconds,
      g = Cb(c._days),
      h = Cb(c._months);
    b.isValid() &&
      ((e = null == e || e),
      f && b._d.setTime(b._d.valueOf() + f * d),
      g && Q(b, "Date", P(b, "Date") + g * d),
      h && ja(b, P(b, "Month") + h * d),
      e && a.updateOffset(b, g || h));
  }
  function Yb(a, b) {
    var c = a.diff(b, "days", !0);
    return c < -6
      ? "sameElse"
      : c < -1
        ? "lastWeek"
        : c < 0
          ? "lastDay"
          : c < 1
            ? "sameDay"
            : c < 2
              ? "nextDay"
              : c < 7
                ? "nextWeek"
                : "sameElse";
  }
  function Zb(b, c) {
    var d = b || tb(),
      e = Fb(d, this).startOf("day"),
      f = a.calendarFormat(this, e) || "sameElse",
      g = c && (z(c[f]) ? c[f].call(this, d) : c[f]);
    return this.format(g || this.localeData().calendar(f, this, tb(d)));
  }
  function $b() {
    return new r(this);
  }
  function _b(a, b) {
    var c = s(a) ? a : tb(a);
    return (
      !(!this.isValid() || !c.isValid()) &&
      ((b = K(f(b) ? "millisecond" : b)),
      "millisecond" === b
        ? this.valueOf() > c.valueOf()
        : c.valueOf() < this.clone().startOf(b).valueOf())
    );
  }
  function ac(a, b) {
    var c = s(a) ? a : tb(a);
    return (
      !(!this.isValid() || !c.isValid()) &&
      ((b = K(f(b) ? "millisecond" : b)),
      "millisecond" === b
        ? this.valueOf() < c.valueOf()
        : this.clone().endOf(b).valueOf() < c.valueOf())
    );
  }
  function bc(a, b, c, d) {
    return (
      (d = d || "()"),
      ("(" === d[0] ? this.isAfter(a, c) : !this.isBefore(a, c)) &&
        (")" === d[1] ? this.isBefore(b, c) : !this.isAfter(b, c))
    );
  }
  function cc(a, b) {
    var c,
      d = s(a) ? a : tb(a);
    return (
      !(!this.isValid() || !d.isValid()) &&
      ((b = K(b || "millisecond")),
      "millisecond" === b
        ? this.valueOf() === d.valueOf()
        : ((c = d.valueOf()),
          this.clone().startOf(b).valueOf() <= c &&
            c <= this.clone().endOf(b).valueOf()))
    );
  }
  function dc(a, b) {
    return this.isSame(a, b) || this.isAfter(a, b);
  }
  function ec(a, b) {
    return this.isSame(a, b) || this.isBefore(a, b);
  }
  function fc(a, b, c) {
    var d, e, f, g;
    return this.isValid()
      ? ((d = Fb(a, this)),
        d.isValid()
          ? ((e = 6e4 * (d.utcOffset() - this.utcOffset())),
            (b = K(b)),
            "year" === b || "month" === b || "quarter" === b
              ? ((g = gc(this, d)),
                "quarter" === b ? (g /= 3) : "year" === b && (g /= 12))
              : ((f = this - d),
                (g =
                  "second" === b
                    ? f / 1e3
                    : "minute" === b
                      ? f / 6e4
                      : "hour" === b
                        ? f / 36e5
                        : "day" === b
                          ? (f - e) / 864e5
                          : "week" === b
                            ? (f - e) / 6048e5
                            : f)),
            c ? g : t(g))
          : NaN)
      : NaN;
  }
  function gc(a, b) {
    var c,
      d,
      e = 12 * (b.year() - a.year()) + (b.month() - a.month()),
      f = a.clone().add(e, "months");
    return (
      b - f < 0
        ? ((c = a.clone().add(e - 1, "months")), (d = (b - f) / (f - c)))
        : ((c = a.clone().add(e + 1, "months")), (d = (b - f) / (c - f))),
      -(e + d) || 0
    );
  }
  function hc() {
    return this.clone().locale("en").format("ddd MMM DD YYYY HH:mm:ss [GMT]ZZ");
  }
  function ic() {
    if (!this.isValid()) return null;
    var a = this.clone().utc();
    return a.year() < 0 || a.year() > 9999
      ? X(a, "YYYYYY-MM-DD[T]HH:mm:ss.SSS[Z]")
      : z(Date.prototype.toISOString)
        ? this.toDate().toISOString()
        : X(a, "YYYY-MM-DD[T]HH:mm:ss.SSS[Z]");
  }
  function jc() {
    if (!this.isValid()) return "moment.invalid(/* " + this._i + " */)";
    var a = "moment",
      b = "";
    this.isLocal() ||
      ((a = 0 === this.utcOffset() ? "moment.utc" : "moment.parseZone"),
      (b = "Z"));
    var c = "[" + a + '("]',
      d = 0 <= this.year() && this.year() <= 9999 ? "YYYY" : "YYYYYY",
      e = "-MM-DD[T]HH:mm:ss.SSS",
      f = b + '[")]';
    return this.format(c + d + e + f);
  }
  function kc(b) {
    b || (b = this.isUtc() ? a.defaultFormatUtc : a.defaultFormat);
    var c = X(this, b);
    return this.localeData().postformat(c);
  }
  function lc(a, b) {
    return this.isValid() && ((s(a) && a.isValid()) || tb(a).isValid())
      ? Sb({ to: this, from: a }).locale(this.locale()).humanize(!b)
      : this.localeData().invalidDate();
  }
  function mc(a) {
    return this.from(tb(), a);
  }
  function nc(a, b) {
    return this.isValid() && ((s(a) && a.isValid()) || tb(a).isValid())
      ? Sb({ from: this, to: a }).locale(this.locale()).humanize(!b)
      : this.localeData().invalidDate();
  }
  function oc(a) {
    return this.to(tb(), a);
  }
  function pc(a) {
    var b;
    return void 0 === a
      ? this._locale._abbr
      : ((b = bb(a)), null != b && (this._locale = b), this);
  }
  function qc() {
    return this._locale;
  }
  function rc(a) {
    switch ((a = K(a))) {
      case "year":
        this.month(0);
      case "quarter":
      case "month":
        this.date(1);
      case "week":
      case "isoWeek":
      case "day":
      case "date":
        this.hours(0);
      case "hour":
        this.minutes(0);
      case "minute":
        this.seconds(0);
      case "second":
        this.milliseconds(0);
    }
    return (
      "week" === a && this.weekday(0),
      "isoWeek" === a && this.isoWeekday(1),
      "quarter" === a && this.month(3 * Math.floor(this.month() / 3)),
      this
    );
  }
  function sc(a) {
    return (
      (a = K(a)),
      void 0 === a || "millisecond" === a
        ? this
        : ("date" === a && (a = "day"),
          this.startOf(a)
            .add(1, "isoWeek" === a ? "week" : a)
            .subtract(1, "ms"))
    );
  }
  function tc() {
    return this._d.valueOf() - 6e4 * (this._offset || 0);
  }
  function uc() {
    return Math.floor(this.valueOf() / 1e3);
  }
  function vc() {
    return new Date(this.valueOf());
  }
  function wc() {
    var a = this;
    return [
      a.year(),
      a.month(),
      a.date(),
      a.hour(),
      a.minute(),
      a.second(),
      a.millisecond(),
    ];
  }
  function xc() {
    var a = this;
    return {
      years: a.year(),
      months: a.month(),
      date: a.date(),
      hours: a.hours(),
      minutes: a.minutes(),
      seconds: a.seconds(),
      milliseconds: a.milliseconds(),
    };
  }
  function yc() {
    return this.isValid() ? this.toISOString() : null;
  }
  function zc() {
    return o(this);
  }
  function Ac() {
    return k({}, n(this));
  }
  function Bc() {
    return n(this).overflow;
  }
  function Cc() {
    return {
      input: this._i,
      format: this._f,
      locale: this._locale,
      isUTC: this._isUTC,
      strict: this._strict,
    };
  }
  function Dc(a, b) {
    U(0, [a, a.length], 0, b);
  }
  function Ec(a) {
    return Ic.call(
      this,
      a,
      this.week(),
      this.weekday(),
      this.localeData()._week.dow,
      this.localeData()._week.doy
    );
  }
  function Fc(a) {
    return Ic.call(this, a, this.isoWeek(), this.isoWeekday(), 1, 4);
  }
  function Gc() {
    return xa(this.year(), 1, 4);
  }
  function Hc() {
    var a = this.localeData()._week;
    return xa(this.year(), a.dow, a.doy);
  }
  function Ic(a, b, c, d, e) {
    var f;
    return null == a
      ? wa(this, d, e).year
      : ((f = xa(a, d, e)), b > f && (b = f), Jc.call(this, a, b, c, d, e));
  }
  function Jc(a, b, c, d, e) {
    var f = va(a, b, c, d, e),
      g = ta(f.year, 0, f.dayOfYear);
    return (
      this.year(g.getUTCFullYear()),
      this.month(g.getUTCMonth()),
      this.date(g.getUTCDate()),
      this
    );
  }
  function Kc(a) {
    return null == a
      ? Math.ceil((this.month() + 1) / 3)
      : this.month(3 * (a - 1) + (this.month() % 3));
  }
  function Lc(a) {
    var b =
      Math.round(
        (this.clone().startOf("day") - this.clone().startOf("year")) / 864e5
      ) + 1;
    return null == a ? b : this.add(a - b, "d");
  }
  function Mc(a, b) {
    b[ke] = u(1e3 * ("0." + a));
  }
  function Nc() {
    return this._isUTC ? "UTC" : "";
  }
  function Oc() {
    return this._isUTC ? "Coordinated Universal Time" : "";
  }
  function Pc(a) {
    return tb(1e3 * a);
  }
  function Qc() {
    return tb.apply(null, arguments).parseZone();
  }
  function Rc(a) {
    return a;
  }
  function Sc(a, b, c, d) {
    var e = bb(),
      f = l().set(d, b);
    return e[c](f, a);
  }
  function Tc(a, b, c) {
    if ((g(a) && ((b = a), (a = void 0)), (a = a || ""), null != b))
      return Sc(a, b, c, "month");
    var d,
      e = [];
    for (d = 0; d < 12; d++) e[d] = Sc(a, d, c, "month");
    return e;
  }
  function Uc(a, b, c, d) {
    "boolean" == typeof a
      ? (g(b) && ((c = b), (b = void 0)), (b = b || ""))
      : ((b = a),
        (c = b),
        (a = !1),
        g(b) && ((c = b), (b = void 0)),
        (b = b || ""));
    var e = bb(),
      f = a ? e._week.dow : 0;
    if (null != c) return Sc(b, (c + f) % 7, d, "day");
    var h,
      i = [];
    for (h = 0; h < 7; h++) i[h] = Sc(b, (h + f) % 7, d, "day");
    return i;
  }
  function Vc(a, b) {
    return Tc(a, b, "months");
  }
  function Wc(a, b) {
    return Tc(a, b, "monthsShort");
  }
  function Xc(a, b, c) {
    return Uc(a, b, c, "weekdays");
  }
  function Yc(a, b, c) {
    return Uc(a, b, c, "weekdaysShort");
  }
  function Zc(a, b, c) {
    return Uc(a, b, c, "weekdaysMin");
  }
  function $c() {
    var a = this._data;
    return (
      (this._milliseconds = df(this._milliseconds)),
      (this._days = df(this._days)),
      (this._months = df(this._months)),
      (a.milliseconds = df(a.milliseconds)),
      (a.seconds = df(a.seconds)),
      (a.minutes = df(a.minutes)),
      (a.hours = df(a.hours)),
      (a.months = df(a.months)),
      (a.years = df(a.years)),
      this
    );
  }
  function _c(a, b, c, d) {
    var e = Sb(b, c);
    return (
      (a._milliseconds += d * e._milliseconds),
      (a._days += d * e._days),
      (a._months += d * e._months),
      a._bubble()
    );
  }
  function ad(a, b) {
    return _c(this, a, b, 1);
  }
  function bd(a, b) {
    return _c(this, a, b, -1);
  }
  function cd(a) {
    return a < 0 ? Math.floor(a) : Math.ceil(a);
  }
  function dd() {
    var a,
      b,
      c,
      d,
      e,
      f = this._milliseconds,
      g = this._days,
      h = this._months,
      i = this._data;
    return (
      (f >= 0 && g >= 0 && h >= 0) ||
        (f <= 0 && g <= 0 && h <= 0) ||
        ((f += 864e5 * cd(fd(h) + g)), (g = 0), (h = 0)),
      (i.milliseconds = f % 1e3),
      (a = t(f / 1e3)),
      (i.seconds = a % 60),
      (b = t(a / 60)),
      (i.minutes = b % 60),
      (c = t(b / 60)),
      (i.hours = c % 24),
      (g += t(c / 24)),
      (e = t(ed(g))),
      (h += e),
      (g -= cd(fd(e))),
      (d = t(h / 12)),
      (h %= 12),
      (i.days = g),
      (i.months = h),
      (i.years = d),
      this
    );
  }
  function ed(a) {
    return (4800 * a) / 146097;
  }
  function fd(a) {
    return (146097 * a) / 4800;
  }
  function gd(a) {
    if (!this.isValid()) return NaN;
    var b,
      c,
      d = this._milliseconds;
    if (((a = K(a)), "month" === a || "year" === a))
      return (
        (b = this._days + d / 864e5),
        (c = this._months + ed(b)),
        "month" === a ? c : c / 12
      );
    switch (((b = this._days + Math.round(fd(this._months))), a)) {
      case "week":
        return b / 7 + d / 6048e5;
      case "day":
        return b + d / 864e5;
      case "hour":
        return 24 * b + d / 36e5;
      case "minute":
        return 1440 * b + d / 6e4;
      case "second":
        return 86400 * b + d / 1e3;
      case "millisecond":
        return Math.floor(864e5 * b) + d;
      default:
        throw new Error("Unknown unit " + a);
    }
  }
  function hd() {
    return this.isValid()
      ? this._milliseconds +
          864e5 * this._days +
          (this._months % 12) * 2592e6 +
          31536e6 * u(this._months / 12)
      : NaN;
  }
  function id(a) {
    return function () {
      return this.as(a);
    };
  }
  function jd(a) {
    return (a = K(a)), this.isValid() ? this[a + "s"]() : NaN;
  }
  function kd(a) {
    return function () {
      return this.isValid() ? this._data[a] : NaN;
    };
  }
  function ld() {
    return t(this.days() / 7);
  }
  function md(a, b, c, d, e) {
    return e.relativeTime(b || 1, !!c, a, d);
  }
  function nd(a, b, c) {
    var d = Sb(a).abs(),
      e = uf(d.as("s")),
      f = uf(d.as("m")),
      g = uf(d.as("h")),
      h = uf(d.as("d")),
      i = uf(d.as("M")),
      j = uf(d.as("y")),
      k = (e <= vf.ss && ["s", e]) ||
        (e < vf.s && ["ss", e]) ||
        (f <= 1 && ["m"]) ||
        (f < vf.m && ["mm", f]) ||
        (g <= 1 && ["h"]) ||
        (g < vf.h && ["hh", g]) ||
        (h <= 1 && ["d"]) ||
        (h < vf.d && ["dd", h]) ||
        (i <= 1 && ["M"]) ||
        (i < vf.M && ["MM", i]) ||
        (j <= 1 && ["y"]) || ["yy", j];
    return (k[2] = b), (k[3] = +a > 0), (k[4] = c), md.apply(null, k);
  }
  function od(a) {
    return void 0 === a ? uf : "function" == typeof a && ((uf = a), !0);
  }
  function pd(a, b) {
    return (
      void 0 !== vf[a] &&
      (void 0 === b ? vf[a] : ((vf[a] = b), "s" === a && (vf.ss = b - 1), !0))
    );
  }
  function qd(a) {
    if (!this.isValid()) return this.localeData().invalidDate();
    var b = this.localeData(),
      c = nd(this, !a, b);
    return a && (c = b.pastFuture(+this, c)), b.postformat(c);
  }
  function rd() {
    if (!this.isValid()) return this.localeData().invalidDate();
    var a,
      b,
      c,
      d = wf(this._milliseconds) / 1e3,
      e = wf(this._days),
      f = wf(this._months);
    (a = t(d / 60)),
      (b = t(a / 60)),
      (d %= 60),
      (a %= 60),
      (c = t(f / 12)),
      (f %= 12);
    var g = c,
      h = f,
      i = e,
      j = b,
      k = a,
      l = d,
      m = this.asSeconds();
    return m
      ? (m < 0 ? "-" : "") +
          "P" +
          (g ? g + "Y" : "") +
          (h ? h + "M" : "") +
          (i ? i + "D" : "") +
          (j || k || l ? "T" : "") +
          (j ? j + "H" : "") +
          (k ? k + "M" : "") +
          (l ? l + "S" : "")
      : "P0D";
  }
  var sd, td;
  td = Array.prototype.some
    ? Array.prototype.some
    : function (a) {
        for (var b = Object(this), c = b.length >>> 0, d = 0; d < c; d++)
          if (d in b && a.call(this, b[d], d, b)) return !0;
        return !1;
      };
  var ud = td,
    vd = (a.momentProperties = []),
    wd = !1,
    xd = {};
  (a.suppressDeprecationWarnings = !1), (a.deprecationHandler = null);
  var yd;
  yd = Object.keys
    ? Object.keys
    : function (a) {
        var b,
          c = [];
        for (b in a) j(a, b) && c.push(b);
        return c;
      };
  var zd,
    Ad = yd,
    Bd = {
      sameDay: "[Today at] LT",
      nextDay: "[Tomorrow at] LT",
      nextWeek: "dddd [at] LT",
      lastDay: "[Yesterday at] LT",
      lastWeek: "[Last] dddd [at] LT",
      sameElse: "L",
    },
    Cd = {
      LTS: "h:mm:ss A",
      LT: "h:mm A",
      L: "MM/DD/YYYY",
      LL: "MMMM D, YYYY",
      LLL: "MMMM D, YYYY h:mm A",
      LLLL: "dddd, MMMM D, YYYY h:mm A",
    },
    Dd = "Invalid date",
    Ed = "%d",
    Fd = /\d{1,2}/,
    Gd = {
      future: "in %s",
      past: "%s ago",
      s: "a few seconds",
      ss: "%d seconds",
      m: "a minute",
      mm: "%d minutes",
      h: "an hour",
      hh: "%d hours",
      d: "a day",
      dd: "%d days",
      M: "a month",
      MM: "%d months",
      y: "a year",
      yy: "%d years",
    },
    Hd = {},
    Id = {},
    Jd =
      /(\[[^\[]*\])|(\\)?([Hh]mm(ss)?|Mo|MM?M?M?|Do|DDDo|DD?D?D?|ddd?d?|do?|w[o|w]?|W[o|W]?|Qo?|YYYYYY|YYYYY|YYYY|YY|gg(ggg?)?|GG(GGG?)?|e|E|a|A|hh?|HH?|kk?|mm?|ss?|S{1,9}|x|X|zz?|ZZ?|.)/g,
    Kd = /(\[[^\[]*\])|(\\)?(LTS|LT|LL?L?L?|l{1,4})/g,
    Ld = {},
    Md = {},
    Nd = /\d/,
    Od = /\d\d/,
    Pd = /\d{3}/,
    Qd = /\d{4}/,
    Rd = /[+-]?\d{6}/,
    Sd = /\d\d?/,
    Td = /\d\d\d\d?/,
    Ud = /\d\d\d\d\d\d?/,
    Vd = /\d{1,3}/,
    Wd = /\d{1,4}/,
    Xd = /[+-]?\d{1,6}/,
    Yd = /\d+/,
    Zd = /[+-]?\d+/,
    $d = /Z|[+-]\d\d:?\d\d/gi,
    _d = /Z|[+-]\d\d(?::?\d\d)?/gi,
    ae = /[+-]?\d+(\.\d{1,3})?/,
    be =
      /[0-9]*['a-z\u00A0-\u05FF\u0700-\uD7FF\uF900-\uFDCF\uFDF0-\uFFEF]+|[\u0600-\u06FF\/]+(\s*?[\u0600-\u06FF]+){1,2}/i,
    ce = {},
    de = {},
    ee = 0,
    fe = 1,
    ge = 2,
    he = 3,
    ie = 4,
    je = 5,
    ke = 6,
    le = 7,
    me = 8;
  zd = Array.prototype.indexOf
    ? Array.prototype.indexOf
    : function (a) {
        var b;
        for (b = 0; b < this.length; ++b) if (this[b] === a) return b;
        return -1;
      };
  var ne = zd;
  U("M", ["MM", 2], "Mo", function () {
    return this.month() + 1;
  }),
    U("MMM", 0, 0, function (a) {
      return this.localeData().monthsShort(this, a);
    }),
    U("MMMM", 0, 0, function (a) {
      return this.localeData().months(this, a);
    }),
    J("month", "M"),
    M("month", 8),
    Z("M", Sd),
    Z("MM", Sd, Od),
    Z("MMM", function (a, b) {
      return b.monthsShortRegex(a);
    }),
    Z("MMMM", function (a, b) {
      return b.monthsRegex(a);
    }),
    ba(["M", "MM"], function (a, b) {
      b[fe] = u(a) - 1;
    }),
    ba(["MMM", "MMMM"], function (a, b, c, d) {
      var e = c._locale.monthsParse(a, d, c._strict);
      null != e ? (b[fe] = e) : (n(c).invalidMonth = a);
    });
  var oe = /D[oD]?(\[[^\[\]]*\]|\s)+MMMM?/,
    pe =
      "January_February_March_April_May_June_July_August_September_October_November_December".split(
        "_"
      ),
    qe = "Jan_Feb_Mar_Apr_May_Jun_Jul_Aug_Sep_Oct_Nov_Dec".split("_"),
    re = be,
    se = be;
  U("Y", 0, 0, function () {
    var a = this.year();
    return a <= 9999 ? "" + a : "+" + a;
  }),
    U(0, ["YY", 2], 0, function () {
      return this.year() % 100;
    }),
    U(0, ["YYYY", 4], 0, "year"),
    U(0, ["YYYYY", 5], 0, "year"),
    U(0, ["YYYYYY", 6, !0], 0, "year"),
    J("year", "y"),
    M("year", 1),
    Z("Y", Zd),
    Z("YY", Sd, Od),
    Z("YYYY", Wd, Qd),
    Z("YYYYY", Xd, Rd),
    Z("YYYYYY", Xd, Rd),
    ba(["YYYYY", "YYYYYY"], ee),
    ba("YYYY", function (b, c) {
      c[ee] = 2 === b.length ? a.parseTwoDigitYear(b) : u(b);
    }),
    ba("YY", function (b, c) {
      c[ee] = a.parseTwoDigitYear(b);
    }),
    ba("Y", function (a, b) {
      b[ee] = parseInt(a, 10);
    }),
    (a.parseTwoDigitYear = function (a) {
      return u(a) + (u(a) > 68 ? 1900 : 2e3);
    });
  var te = O("FullYear", !0);
  U("w", ["ww", 2], "wo", "week"),
    U("W", ["WW", 2], "Wo", "isoWeek"),
    J("week", "w"),
    J("isoWeek", "W"),
    M("week", 5),
    M("isoWeek", 5),
    Z("w", Sd),
    Z("ww", Sd, Od),
    Z("W", Sd),
    Z("WW", Sd, Od),
    ca(["w", "ww", "W", "WW"], function (a, b, c, d) {
      b[d.substr(0, 1)] = u(a);
    });
  var ue = { dow: 0, doy: 6 };
  U("d", 0, "do", "day"),
    U("dd", 0, 0, function (a) {
      return this.localeData().weekdaysMin(this, a);
    }),
    U("ddd", 0, 0, function (a) {
      return this.localeData().weekdaysShort(this, a);
    }),
    U("dddd", 0, 0, function (a) {
      return this.localeData().weekdays(this, a);
    }),
    U("e", 0, 0, "weekday"),
    U("E", 0, 0, "isoWeekday"),
    J("day", "d"),
    J("weekday", "e"),
    J("isoWeekday", "E"),
    M("day", 11),
    M("weekday", 11),
    M("isoWeekday", 11),
    Z("d", Sd),
    Z("e", Sd),
    Z("E", Sd),
    Z("dd", function (a, b) {
      return b.weekdaysMinRegex(a);
    }),
    Z("ddd", function (a, b) {
      return b.weekdaysShortRegex(a);
    }),
    Z("dddd", function (a, b) {
      return b.weekdaysRegex(a);
    }),
    ca(["dd", "ddd", "dddd"], function (a, b, c, d) {
      var e = c._locale.weekdaysParse(a, d, c._strict);
      null != e ? (b.d = e) : (n(c).invalidWeekday = a);
    }),
    ca(["d", "e", "E"], function (a, b, c, d) {
      b[d] = u(a);
    });
  var ve = "Sunday_Monday_Tuesday_Wednesday_Thursday_Friday_Saturday".split(
      "_"
    ),
    we = "Sun_Mon_Tue_Wed_Thu_Fri_Sat".split("_"),
    xe = "Su_Mo_Tu_We_Th_Fr_Sa".split("_"),
    ye = be,
    ze = be,
    Ae = be;
  U("H", ["HH", 2], 0, "hour"),
    U("h", ["hh", 2], 0, Ra),
    U("k", ["kk", 2], 0, Sa),
    U("hmm", 0, 0, function () {
      return "" + Ra.apply(this) + T(this.minutes(), 2);
    }),
    U("hmmss", 0, 0, function () {
      return "" + Ra.apply(this) + T(this.minutes(), 2) + T(this.seconds(), 2);
    }),
    U("Hmm", 0, 0, function () {
      return "" + this.hours() + T(this.minutes(), 2);
    }),
    U("Hmmss", 0, 0, function () {
      return "" + this.hours() + T(this.minutes(), 2) + T(this.seconds(), 2);
    }),
    Ta("a", !0),
    Ta("A", !1),
    J("hour", "h"),
    M("hour", 13),
    Z("a", Ua),
    Z("A", Ua),
    Z("H", Sd),
    Z("h", Sd),
    Z("k", Sd),
    Z("HH", Sd, Od),
    Z("hh", Sd, Od),
    Z("kk", Sd, Od),
    Z("hmm", Td),
    Z("hmmss", Ud),
    Z("Hmm", Td),
    Z("Hmmss", Ud),
    ba(["H", "HH"], he),
    ba(["k", "kk"], function (a, b, c) {
      var d = u(a);
      b[he] = 24 === d ? 0 : d;
    }),
    ba(["a", "A"], function (a, b, c) {
      (c._isPm = c._locale.isPM(a)), (c._meridiem = a);
    }),
    ba(["h", "hh"], function (a, b, c) {
      (b[he] = u(a)), (n(c).bigHour = !0);
    }),
    ba("hmm", function (a, b, c) {
      var d = a.length - 2;
      (b[he] = u(a.substr(0, d))),
        (b[ie] = u(a.substr(d))),
        (n(c).bigHour = !0);
    }),
    ba("hmmss", function (a, b, c) {
      var d = a.length - 4,
        e = a.length - 2;
      (b[he] = u(a.substr(0, d))),
        (b[ie] = u(a.substr(d, 2))),
        (b[je] = u(a.substr(e))),
        (n(c).bigHour = !0);
    }),
    ba("Hmm", function (a, b, c) {
      var d = a.length - 2;
      (b[he] = u(a.substr(0, d))), (b[ie] = u(a.substr(d)));
    }),
    ba("Hmmss", function (a, b, c) {
      var d = a.length - 4,
        e = a.length - 2;
      (b[he] = u(a.substr(0, d))),
        (b[ie] = u(a.substr(d, 2))),
        (b[je] = u(a.substr(e)));
    });
  var Be,
    Ce = /[ap]\.?m?\.?/i,
    De = O("Hours", !0),
    Ee = {
      calendar: Bd,
      longDateFormat: Cd,
      invalidDate: Dd,
      ordinal: Ed,
      dayOfMonthOrdinalParse: Fd,
      relativeTime: Gd,
      months: pe,
      monthsShort: qe,
      week: ue,
      weekdays: ve,
      weekdaysMin: xe,
      weekdaysShort: we,
      meridiemParse: Ce,
    },
    Fe = {},
    Ge = {},
    He =
      /^\s*((?:[+-]\d{6}|\d{4})-(?:\d\d-\d\d|W\d\d-\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?::\d\d(?::\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,
    Ie =
      /^\s*((?:[+-]\d{6}|\d{4})(?:\d\d\d\d|W\d\d\d|W\d\d|\d\d\d|\d\d))(?:(T| )(\d\d(?:\d\d(?:\d\d(?:[.,]\d+)?)?)?)([\+\-]\d\d(?::?\d\d)?|\s*Z)?)?$/,
    Je = /Z|[+-]\d\d(?::?\d\d)?/,
    Ke = [
      ["YYYYYY-MM-DD", /[+-]\d{6}-\d\d-\d\d/],
      ["YYYY-MM-DD", /\d{4}-\d\d-\d\d/],
      ["GGGG-[W]WW-E", /\d{4}-W\d\d-\d/],
      ["GGGG-[W]WW", /\d{4}-W\d\d/, !1],
      ["YYYY-DDD", /\d{4}-\d{3}/],
      ["YYYY-MM", /\d{4}-\d\d/, !1],
      ["YYYYYYMMDD", /[+-]\d{10}/],
      ["YYYYMMDD", /\d{8}/],
      ["GGGG[W]WWE", /\d{4}W\d{3}/],
      ["GGGG[W]WW", /\d{4}W\d{2}/, !1],
      ["YYYYDDD", /\d{7}/],
    ],
    Le = [
      ["HH:mm:ss.SSSS", /\d\d:\d\d:\d\d\.\d+/],
      ["HH:mm:ss,SSSS", /\d\d:\d\d:\d\d,\d+/],
      ["HH:mm:ss", /\d\d:\d\d:\d\d/],
      ["HH:mm", /\d\d:\d\d/],
      ["HHmmss.SSSS", /\d\d\d\d\d\d\.\d+/],
      ["HHmmss,SSSS", /\d\d\d\d\d\d,\d+/],
      ["HHmmss", /\d\d\d\d\d\d/],
      ["HHmm", /\d\d\d\d/],
      ["HH", /\d\d/],
    ],
    Me = /^\/?Date\((\-?\d+)/i,
    Ne =
      /^((?:Mon|Tue|Wed|Thu|Fri|Sat|Sun),?\s)?(\d?\d\s(?:Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec)\s(?:\d\d)?\d\d\s)(\d\d:\d\d)(\:\d\d)?(\s(?:UT|GMT|[ECMP][SD]T|[A-IK-Za-ik-z]|[+-]\d{4}))$/;
  (a.createFromInputFallback = x(
    "value provided is not in a recognized RFC2822 or ISO format. moment construction falls back to js Date(), which is not reliable across all browsers and versions. Non RFC2822/ISO date formats are discouraged and will be removed in an upcoming major release. Please refer to http://momentjs.com/guides/#/warnings/js-date/ for more info.",
    function (a) {
      a._d = new Date(a._i + (a._useUTC ? " UTC" : ""));
    }
  )),
    (a.ISO_8601 = function () {}),
    (a.RFC_2822 = function () {});
  var Oe = x(
      "moment().min is deprecated, use moment.max instead. http://momentjs.com/guides/#/warnings/min-max/",
      function () {
        var a = tb.apply(null, arguments);
        return this.isValid() && a.isValid() ? (a < this ? this : a) : p();
      }
    ),
    Pe = x(
      "moment().max is deprecated, use moment.min instead. http://momentjs.com/guides/#/warnings/min-max/",
      function () {
        var a = tb.apply(null, arguments);
        return this.isValid() && a.isValid() ? (a > this ? this : a) : p();
      }
    ),
    Qe = function () {
      return Date.now ? Date.now() : +new Date();
    },
    Re = [
      "year",
      "quarter",
      "month",
      "week",
      "day",
      "hour",
      "minute",
      "second",
      "millisecond",
    ];
  Db("Z", ":"),
    Db("ZZ", ""),
    Z("Z", _d),
    Z("ZZ", _d),
    ba(["Z", "ZZ"], function (a, b, c) {
      (c._useUTC = !0), (c._tzm = Eb(_d, a));
    });
  var Se = /([\+\-]|\d\d)/gi;
  a.updateOffset = function () {};
  var Te = /^(\-)?(?:(\d*)[. ])?(\d+)\:(\d+)(?:\:(\d+)(\.\d*)?)?$/,
    Ue =
      /^(-)?P(?:(-?[0-9,.]*)Y)?(?:(-?[0-9,.]*)M)?(?:(-?[0-9,.]*)W)?(?:(-?[0-9,.]*)D)?(?:T(?:(-?[0-9,.]*)H)?(?:(-?[0-9,.]*)M)?(?:(-?[0-9,.]*)S)?)?$/;
  (Sb.fn = Ab.prototype), (Sb.invalid = zb);
  var Ve = Wb(1, "add"),
    We = Wb(-1, "subtract");
  (a.defaultFormat = "YYYY-MM-DDTHH:mm:ssZ"),
    (a.defaultFormatUtc = "YYYY-MM-DDTHH:mm:ss[Z]");
  var Xe = x(
    "moment().lang() is deprecated. Instead, use moment().localeData() to get the language configuration. Use moment().locale() to change languages.",
    function (a) {
      return void 0 === a ? this.localeData() : this.locale(a);
    }
  );
  U(0, ["gg", 2], 0, function () {
    return this.weekYear() % 100;
  }),
    U(0, ["GG", 2], 0, function () {
      return this.isoWeekYear() % 100;
    }),
    Dc("gggg", "weekYear"),
    Dc("ggggg", "weekYear"),
    Dc("GGGG", "isoWeekYear"),
    Dc("GGGGG", "isoWeekYear"),
    J("weekYear", "gg"),
    J("isoWeekYear", "GG"),
    M("weekYear", 1),
    M("isoWeekYear", 1),
    Z("G", Zd),
    Z("g", Zd),
    Z("GG", Sd, Od),
    Z("gg", Sd, Od),
    Z("GGGG", Wd, Qd),
    Z("gggg", Wd, Qd),
    Z("GGGGG", Xd, Rd),
    Z("ggggg", Xd, Rd),
    ca(["gggg", "ggggg", "GGGG", "GGGGG"], function (a, b, c, d) {
      b[d.substr(0, 2)] = u(a);
    }),
    ca(["gg", "GG"], function (b, c, d, e) {
      c[e] = a.parseTwoDigitYear(b);
    }),
    U("Q", 0, "Qo", "quarter"),
    J("quarter", "Q"),
    M("quarter", 7),
    Z("Q", Nd),
    ba("Q", function (a, b) {
      b[fe] = 3 * (u(a) - 1);
    }),
    U("D", ["DD", 2], "Do", "date"),
    J("date", "D"),
    M("date", 9),
    Z("D", Sd),
    Z("DD", Sd, Od),
    Z("Do", function (a, b) {
      return a
        ? b._dayOfMonthOrdinalParse || b._ordinalParse
        : b._dayOfMonthOrdinalParseLenient;
    }),
    ba(["D", "DD"], ge),
    ba("Do", function (a, b) {
      b[ge] = u(a.match(Sd)[0], 10);
    });
  var Ye = O("Date", !0);
  U("DDD", ["DDDD", 3], "DDDo", "dayOfYear"),
    J("dayOfYear", "DDD"),
    M("dayOfYear", 4),
    Z("DDD", Vd),
    Z("DDDD", Pd),
    ba(["DDD", "DDDD"], function (a, b, c) {
      c._dayOfYear = u(a);
    }),
    U("m", ["mm", 2], 0, "minute"),
    J("minute", "m"),
    M("minute", 14),
    Z("m", Sd),
    Z("mm", Sd, Od),
    ba(["m", "mm"], ie);
  var Ze = O("Minutes", !1);
  U("s", ["ss", 2], 0, "second"),
    J("second", "s"),
    M("second", 15),
    Z("s", Sd),
    Z("ss", Sd, Od),
    ba(["s", "ss"], je);
  var $e = O("Seconds", !1);
  U("S", 0, 0, function () {
    return ~~(this.millisecond() / 100);
  }),
    U(0, ["SS", 2], 0, function () {
      return ~~(this.millisecond() / 10);
    }),
    U(0, ["SSS", 3], 0, "millisecond"),
    U(0, ["SSSS", 4], 0, function () {
      return 10 * this.millisecond();
    }),
    U(0, ["SSSSS", 5], 0, function () {
      return 100 * this.millisecond();
    }),
    U(0, ["SSSSSS", 6], 0, function () {
      return 1e3 * this.millisecond();
    }),
    U(0, ["SSSSSSS", 7], 0, function () {
      return 1e4 * this.millisecond();
    }),
    U(0, ["SSSSSSSS", 8], 0, function () {
      return 1e5 * this.millisecond();
    }),
    U(0, ["SSSSSSSSS", 9], 0, function () {
      return 1e6 * this.millisecond();
    }),
    J("millisecond", "ms"),
    M("millisecond", 16),
    Z("S", Vd, Nd),
    Z("SS", Vd, Od),
    Z("SSS", Vd, Pd);
  var _e;
  for (_e = "SSSS"; _e.length <= 9; _e += "S") Z(_e, Yd);
  for (_e = "S"; _e.length <= 9; _e += "S") ba(_e, Mc);
  var af = O("Milliseconds", !1);
  U("z", 0, 0, "zoneAbbr"), U("zz", 0, 0, "zoneName");
  var bf = r.prototype;
  (bf.add = Ve),
    (bf.calendar = Zb),
    (bf.clone = $b),
    (bf.diff = fc),
    (bf.endOf = sc),
    (bf.format = kc),
    (bf.from = lc),
    (bf.fromNow = mc),
    (bf.to = nc),
    (bf.toNow = oc),
    (bf.get = R),
    (bf.invalidAt = Bc),
    (bf.isAfter = _b),
    (bf.isBefore = ac),
    (bf.isBetween = bc),
    (bf.isSame = cc),
    (bf.isSameOrAfter = dc),
    (bf.isSameOrBefore = ec),
    (bf.isValid = zc),
    (bf.lang = Xe),
    (bf.locale = pc),
    (bf.localeData = qc),
    (bf.max = Pe),
    (bf.min = Oe),
    (bf.parsingFlags = Ac),
    (bf.set = S),
    (bf.startOf = rc),
    (bf.subtract = We),
    (bf.toArray = wc),
    (bf.toObject = xc),
    (bf.toDate = vc),
    (bf.toISOString = ic),
    (bf.inspect = jc),
    (bf.toJSON = yc),
    (bf.toString = hc),
    (bf.unix = uc),
    (bf.valueOf = tc),
    (bf.creationData = Cc),
    (bf.year = te),
    (bf.isLeapYear = ra),
    (bf.weekYear = Ec),
    (bf.isoWeekYear = Fc),
    (bf.quarter = bf.quarters = Kc),
    (bf.month = ka),
    (bf.daysInMonth = la),
    (bf.week = bf.weeks = Ba),
    (bf.isoWeek = bf.isoWeeks = Ca),
    (bf.weeksInYear = Hc),
    (bf.isoWeeksInYear = Gc),
    (bf.date = Ye),
    (bf.day = bf.days = Ka),
    (bf.weekday = La),
    (bf.isoWeekday = Ma),
    (bf.dayOfYear = Lc),
    (bf.hour = bf.hours = De),
    (bf.minute = bf.minutes = Ze),
    (bf.second = bf.seconds = $e),
    (bf.millisecond = bf.milliseconds = af),
    (bf.utcOffset = Hb),
    (bf.utc = Jb),
    (bf.local = Kb),
    (bf.parseZone = Lb),
    (bf.hasAlignedHourOffset = Mb),
    (bf.isDST = Nb),
    (bf.isLocal = Pb),
    (bf.isUtcOffset = Qb),
    (bf.isUtc = Rb),
    (bf.isUTC = Rb),
    (bf.zoneAbbr = Nc),
    (bf.zoneName = Oc),
    (bf.dates = x("dates accessor is deprecated. Use date instead.", Ye)),
    (bf.months = x("months accessor is deprecated. Use month instead", ka)),
    (bf.years = x("years accessor is deprecated. Use year instead", te)),
    (bf.zone = x(
      "moment().zone is deprecated, use moment().utcOffset instead. http://momentjs.com/guides/#/warnings/zone/",
      Ib
    )),
    (bf.isDSTShifted = x(
      "isDSTShifted is deprecated. See http://momentjs.com/guides/#/warnings/dst-shifted/ for more information",
      Ob
    ));
  var cf = C.prototype;
  (cf.calendar = D),
    (cf.longDateFormat = E),
    (cf.invalidDate = F),
    (cf.ordinal = G),
    (cf.preparse = Rc),
    (cf.postformat = Rc),
    (cf.relativeTime = H),
    (cf.pastFuture = I),
    (cf.set = A),
    (cf.months = fa),
    (cf.monthsShort = ga),
    (cf.monthsParse = ia),
    (cf.monthsRegex = na),
    (cf.monthsShortRegex = ma),
    (cf.week = ya),
    (cf.firstDayOfYear = Aa),
    (cf.firstDayOfWeek = za),
    (cf.weekdays = Fa),
    (cf.weekdaysMin = Ha),
    (cf.weekdaysShort = Ga),
    (cf.weekdaysParse = Ja),
    (cf.weekdaysRegex = Na),
    (cf.weekdaysShortRegex = Oa),
    (cf.weekdaysMinRegex = Pa),
    (cf.isPM = Va),
    (cf.meridiem = Wa),
    $a("en", {
      dayOfMonthOrdinalParse: /\d{1,2}(th|st|nd|rd)/,
      ordinal: function (a) {
        var b = a % 10,
          c =
            1 === u((a % 100) / 10)
              ? "th"
              : 1 === b
                ? "st"
                : 2 === b
                  ? "nd"
                  : 3 === b
                    ? "rd"
                    : "th";
        return a + c;
      },
    }),
    (a.lang = x("moment.lang is deprecated. Use moment.locale instead.", $a)),
    (a.langData = x(
      "moment.langData is deprecated. Use moment.localeData instead.",
      bb
    ));
  var df = Math.abs,
    ef = id("ms"),
    ff = id("s"),
    gf = id("m"),
    hf = id("h"),
    jf = id("d"),
    kf = id("w"),
    lf = id("M"),
    mf = id("y"),
    nf = kd("milliseconds"),
    of = kd("seconds"),
    pf = kd("minutes"),
    qf = kd("hours"),
    rf = kd("days"),
    sf = kd("months"),
    tf = kd("years"),
    uf = Math.round,
    vf = { ss: 44, s: 45, m: 45, h: 22, d: 26, M: 11 },
    wf = Math.abs,
    xf = Ab.prototype;
  return (
    (xf.isValid = yb),
    (xf.abs = $c),
    (xf.add = ad),
    (xf.subtract = bd),
    (xf.as = gd),
    (xf.asMilliseconds = ef),
    (xf.asSeconds = ff),
    (xf.asMinutes = gf),
    (xf.asHours = hf),
    (xf.asDays = jf),
    (xf.asWeeks = kf),
    (xf.asMonths = lf),
    (xf.asYears = mf),
    (xf.valueOf = hd),
    (xf._bubble = dd),
    (xf.get = jd),
    (xf.milliseconds = nf),
    (xf.seconds = of),
    (xf.minutes = pf),
    (xf.hours = qf),
    (xf.days = rf),
    (xf.weeks = ld),
    (xf.months = sf),
    (xf.years = tf),
    (xf.humanize = qd),
    (xf.toISOString = rd),
    (xf.toString = rd),
    (xf.toJSON = rd),
    (xf.locale = pc),
    (xf.localeData = qc),
    (xf.toIsoString = x(
      "toIsoString() is deprecated. Please use toISOString() instead (notice the capitals)",
      rd
    )),
    (xf.lang = Xe),
    U("X", 0, 0, "unix"),
    U("x", 0, 0, "valueOf"),
    Z("x", Zd),
    Z("X", ae),
    ba("X", function (a, b, c) {
      c._d = new Date(1e3 * parseFloat(a, 10));
    }),
    ba("x", function (a, b, c) {
      c._d = new Date(u(a));
    }),
    (a.version = "2.18.1"),
    b(tb),
    (a.fn = bf),
    (a.min = vb),
    (a.max = wb),
    (a.now = Qe),
    (a.utc = l),
    (a.unix = Pc),
    (a.months = Vc),
    (a.isDate = h),
    (a.locale = $a),
    (a.invalid = p),
    (a.duration = Sb),
    (a.isMoment = s),
    (a.weekdays = Xc),
    (a.parseZone = Qc),
    (a.localeData = bb),
    (a.isDuration = Bb),
    (a.monthsShort = Wc),
    (a.weekdaysMin = Zc),
    (a.defineLocale = _a),
    (a.updateLocale = ab),
    (a.locales = cb),
    (a.weekdaysShort = Yc),
    (a.normalizeUnits = K),
    (a.relativeTimeRounding = od),
    (a.relativeTimeThreshold = pd),
    (a.calendarFormat = Yb),
    (a.prototype = bf),
    a
  );
});

/*! clndr.min.js v1.4.7 2016-11-26 */
!(function (t) {
  "function" == typeof define && define.amd
    ? define(["jquery", "moment"], t)
    : "object" == typeof exports
      ? t(require("jquery"), require("moment"))
      : t(jQuery, moment);
})(function (t, e) {
  function n(n, i) {
    var o, r;
    (this.element = n),
      (this.options = t.extend(!0, {}, a, i)),
      this.options.moment && (e = this.options.moment),
      (this.constraints = {
        next: !0,
        today: !0,
        previous: !0,
        nextYear: !0,
        previousYear: !0,
      }),
      this.options.events.length &&
        (this.options.multiDayEvents
          ? (this.options.events = this.addMultiDayMomentObjectsToEvents(
              this.options.events
            ))
          : (this.options.events = this.addMomentObjectToEvents(
              this.options.events
            ))),
      this.options.lengthOfTime.months || this.options.lengthOfTime.days
        ? this.options.lengthOfTime.months
          ? ((this.options.lengthOfTime.days = null),
            this.options.lengthOfTime.startDate
              ? (this.intervalStart = e(
                  this.options.lengthOfTime.startDate
                ).startOf("month"))
              : this.options.startWithMonth
                ? (this.intervalStart = e(this.options.startWithMonth).startOf(
                    "month"
                  ))
                : (this.intervalStart = e().startOf("month")),
            (this.intervalEnd = e(this.intervalStart)
              .add(this.options.lengthOfTime.months, "months")
              .subtract(1, "days")),
            (this.month = this.intervalStart.clone()))
          : this.options.lengthOfTime.days &&
            (this.options.lengthOfTime.startDate
              ? (this.intervalStart = e(
                  this.options.lengthOfTime.startDate
                ).startOf("day"))
              : (this.intervalStart = e().weekday(0).startOf("day")),
            (this.intervalEnd = e(this.intervalStart)
              .add(this.options.lengthOfTime.days - 1, "days")
              .endOf("day")),
            (this.month = this.intervalStart.clone()))
        : ((this.month = e().startOf("month")),
          (this.intervalStart = e(this.month)),
          (this.intervalEnd = e(this.month).endOf("month"))),
      this.options.startWithMonth &&
        ((this.month = e(this.options.startWithMonth).startOf("month")),
        (this.intervalStart = e(this.month)),
        (this.intervalEnd = this.options.lengthOfTime.days
          ? e(this.month)
              .add(this.options.lengthOfTime.days - 1, "days")
              .endOf("day")
          : e(this.month).endOf("month"))),
      this.options.constraints &&
        (this.options.constraints.startDate &&
          ((r = e(this.options.constraints.startDate)),
          this.options.lengthOfTime.days
            ? (this.intervalStart.isBefore(r, "week") &&
                (this.intervalStart = r.startOf("week")),
              (this.intervalStart.diff(this.intervalEnd, "days") <
                this.options.lengthOfTime.days ||
                this.intervalEnd.isBefore(this.intervalStart)) &&
                ((this.intervalEnd = e(this.intervalStart)
                  .add(this.options.lengthOfTime.days - 1, "days")
                  .endOf("day")),
                (this.month = this.intervalStart.clone())))
            : (this.intervalStart.isBefore(r, "month") &&
                (this.intervalStart
                  .set("month", r.month())
                  .set("year", r.year()),
                this.month.set("month", r.month()).set("year", r.year())),
              this.intervalEnd.isBefore(r, "month") &&
                this.intervalEnd
                  .set("month", r.month())
                  .set("year", r.year()))),
        this.options.constraints.endDate &&
          ((o = e(this.options.constraints.endDate)),
          this.options.lengthOfTime.days
            ? this.intervalStart.isAfter(o, "week") &&
              ((this.intervalStart = e(o)
                .endOf("week")
                .subtract(this.options.lengthOfTime.days - 1, "days")
                .startOf("day")),
              (this.intervalEnd = e(o).endOf("week")),
              (this.month = this.intervalStart.clone()))
            : (this.intervalEnd.isAfter(o, "month") &&
                (this.intervalEnd.set("month", o.month()).set("year", o.year()),
                this.month.set("month", o.month()).set("year", o.year())),
              this.intervalStart.isAfter(o, "month") &&
                this.intervalStart
                  .set("month", o.month())
                  .set("year", o.year())))),
      (this._defaults = a),
      (this._name = s),
      this.init();
  }
  var s = "clndr",
    a = {
      events: [],
      ready: null,
      extras: null,
      render: null,
      moment: null,
      weekOffset: 0,
      constraints: null,
      forceSixRows: null,
      selectedDate: null,
      doneRendering: null,
      daysOfTheWeek: null,
      multiDayEvents: null,
      startWithMonth: null,
      dateParameter: "date",
      template:
        "<div class='clndr-controls'> <div class='clndr-control-button'><span class='clndr-previous-button'>previous</span></div><div class='month'> <%=month %> <%=year %> </div><div class='clndr-control-button rightalign'><span class='clndr-next-button'>next</span></div></div><div class='swiper-container swiper-container-calendar'> <div class='swiper-wrapper '><div class=' swiper-slide'><% for(var i=0; i < numberOfRows; i++){%> <% for(var j=0; j < 7; j++){%> <% var d=j + i * 7; %> <div class=' <%=days[d].classes %>' > <div class='day-contents'><small></small><span class='span-day'><%=days[d].day %></span> </div></div><%}%><%}%> </div></div></div>",
      showAdjacentMonths: !0,
      trackSelectedDate: !1,
      adjacentDaysChangeMonth: !1,
      ignoreInactiveDaysInSelection: null,
      lengthOfTime: { days: null, interval: 1, months: null },
      clickEvents: {
        click: null,
        today: null,
        nextYear: null,
        nextMonth: null,
        nextInterval: null,
        previousYear: null,
        onYearChange: null,
        previousMonth: null,
        onMonthChange: null,
        previousInterval: null,
        onIntervalChange: null,
      },
      targets: {
        day: "day",
        empty: "empty",
        nextButton: "clndr-next-button",
        todayButton: "clndr-today-button",
        previousButton: "clndr-previous-button",
        nextYearButton: "clndr-next-year-button",
        previousYearButton: "clndr-previous-year-button",
      },
      classes: {
        past: "past",
        today: "today",
        event: "event",
        inactive: "inactive",
        selected: "selected",
        lastMonth: "last-month",
        nextMonth: "next-month",
        adjacentMonth: "adjacent-month",
      },
    };
  (n.prototype.init = function () {
    if (
      ((this.daysOfTheWeek = this.options.daysOfTheWeek || []),
      !this.options.daysOfTheWeek)
    ) {
      this.daysOfTheWeek = [];
      for (var n = 0; 7 > n; n++)
        this.daysOfTheWeek.push(e().weekday(n).format("dd").charAt(0));
    }
    if (
      (this.options.weekOffset &&
        (this.daysOfTheWeek = this.shiftWeekdayLabels(this.options.weekOffset)),
      !t.isFunction(this.options.render))
    ) {
      if (((this.options.render = null), "undefined" == typeof _))
        throw new Error(
          "Underscore was not found. Please include underscore.js OR provide a custom render function."
        );
      this.compiledClndrTemplate = _.template(this.options.template);
    }
    t(this.element).html("<div class='clndr'></div>"),
      (this.calendarContainer = t(".clndr", this.element)),
      this.bindEvents(),
      this.render(),
      this.options.ready && this.options.ready.apply(this, []);
  }),
    (n.prototype.shiftWeekdayLabels = function (t) {
      for (var e = this.daysOfTheWeek, n = 0; t > n; n++) e.push(e.shift());
      return e;
    }),
    (n.prototype.createDaysObject = function (n, s) {
      var a,
        i,
        o,
        r,
        h,
        l,
        d = [],
        c = n.clone();
      if (
        (s.diff(n, "days"),
        (this._currentIntervalStart = n.clone()),
        (this.eventsLastMonth = []),
        (this.eventsNextMonth = []),
        (this.eventsThisInterval = []),
        this.options.events.length &&
          ((this.eventsThisInterval = t(this.options.events)
            .filter(function () {
              var t = this._clndrStartDateObject.isAfter(s);
              return !this._clndrEndDateObject.isBefore(n) && !t;
            })
            .toArray()),
          this.options.showAdjacentMonths &&
            ((a = n.clone().subtract(1, "months").startOf("month")),
            (i = a.clone().endOf("month")),
            (o = s.clone().add(1, "months").startOf("month")),
            (r = o.clone().endOf("month")),
            (this.eventsLastMonth = t(this.options.events)
              .filter(function () {
                var t = this._clndrEndDateObject.isBefore(a),
                  e = this._clndrStartDateObject.isAfter(i);
                return !t && !e;
              })
              .toArray()),
            (this.eventsNextMonth = t(this.options.events)
              .filter(function () {
                var t = this._clndrEndDateObject.isBefore(o),
                  e = this._clndrStartDateObject.isAfter(r);
                return !t && !e;
              })
              .toArray()))),
        !this.options.lengthOfTime.days)
      )
        if (
          ((h = c.weekday() - this.options.weekOffset),
          0 > h && (h += 7),
          this.options.showAdjacentMonths)
        )
          for (var v = 1; h >= v; v++) {
            var p = e([n.year(), n.month(), v]).subtract(h, "days");
            d.push(this.createDayObject(p, this.eventsLastMonth));
          }
        else
          for (v = 0; h > v; v++)
            d.push(
              this.calendarDay({
                classes:
                  this.options.targets.empty +
                  " " +
                  this.options.classes.lastMonth,
              })
            );
      for (l = n.clone(); l.isBefore(s) || l.isSame(s, "day"); )
        d.push(this.createDayObject(l.clone(), this.eventsThisInterval)),
          l.add(1, "days");
      if (!this.options.lengthOfTime.days)
        for (; d.length % 7 != 0; )
          this.options.showAdjacentMonths
            ? d.push(this.createDayObject(l.clone(), this.eventsNextMonth))
            : d.push(
                this.calendarDay({
                  classes:
                    this.options.targets.empty +
                    " " +
                    this.options.classes.nextMonth,
                })
              ),
            l.add(1, "days");
      if (this.options.forceSixRows && 42 !== d.length)
        for (; d.length < 42; )
          this.options.showAdjacentMonths
            ? (d.push(this.createDayObject(l.clone(), this.eventsNextMonth)),
              l.add(1, "days"))
            : d.push(
                this.calendarDay({
                  classes:
                    this.options.targets.empty +
                    " " +
                    this.options.classes.nextMonth,
                })
              );
      return d;
    }),
    (n.prototype.createDayObject = function (t, n) {
      var s,
        a,
        i,
        o = 0,
        r = e(),
        h = [],
        l = "",
        d = { isToday: !1, isInactive: !1, isAdjacentMonth: !1 };
      for (
        !t.isValid() &&
        t.hasOwnProperty("_d") &&
        void 0 != t._d &&
        (t = e(t._d));
        o < n.length;
        o++
      ) {
        var c = n[o]._clndrStartDateObject,
          v = n[o]._clndrEndDateObject;
        (t.isSame(c, "day") || t.isAfter(c, "day")) &&
          (t.isSame(v, "day") || t.isBefore(v, "day")) &&
          h.push(n[o]);
      }
      return (
        r.format("YYYY-MM-DD") == t.format("YYYY-MM-DD") &&
          ((l += " " + this.options.classes.today), (d.isToday = !0)),
        t.isBefore(r, "day") && (l += " " + this.options.classes.past),
        h.length && (l += " " + this.options.classes.event),
        this.options.lengthOfTime.days ||
          (this._currentIntervalStart.month() > t.month()
            ? ((l += " " + this.options.classes.adjacentMonth),
              (d.isAdjacentMonth = !0),
              (l +=
                this._currentIntervalStart.year() === t.year()
                  ? " " + this.options.classes.lastMonth
                  : " " + this.options.classes.nextMonth))
            : this._currentIntervalStart.month() < t.month() &&
              ((l += " " + this.options.classes.adjacentMonth),
              (d.isAdjacentMonth = !0),
              (l +=
                this._currentIntervalStart.year() === t.year()
                  ? " " + this.options.classes.nextMonth
                  : " " + this.options.classes.lastMonth))),
        this.options.constraints &&
          ((a = e(this.options.constraints.endDate)),
          (s = e(this.options.constraints.startDate)),
          this.options.constraints.startDate &&
            t.isBefore(s) &&
            ((l += " " + this.options.classes.inactive), (d.isInactive = !0)),
          this.options.constraints.endDate &&
            t.isAfter(a) &&
            ((l += " " + this.options.classes.inactive), (d.isInactive = !0))),
        !t.isValid() &&
          t.hasOwnProperty("_d") &&
          void 0 != t._d &&
          (t = e(t._d)),
        (i = e(this.options.selectedDate)),
        this.options.selectedDate &&
          t.isSame(i, "day") &&
          (l += " " + this.options.classes.selected),
        (l += " calendar-day-" + t.format("YYYY-MM-DD")),
        (l += " calendar-dow-" + t.weekday()),
        this.calendarDay({
          date: t,
          day: t.date(),
          events: h,
          properties: d,
          classes: this.options.targets.day + l,
        })
      );
    }),
    (n.prototype.render = function () {
      var t,
        n,
        s,
        a = {},
        i = null,
        o = null,
        r = this.intervalEnd.clone().add(1, "years"),
        h = this.intervalStart.clone().subtract(1, "years");
      if ((this.calendarContainer.empty(), this.options.lengthOfTime.days))
        (c = this.createDaysObject(
          this.intervalStart.clone(),
          this.intervalEnd.clone()
        )),
          (a = {
            days: c,
            months: [],
            year: null,
            month: null,
            eventsLastMonth: [],
            eventsNextMonth: [],
            eventsThisMonth: [],
            extras: this.options.extras,
            daysOfTheWeek: this.daysOfTheWeek,
            intervalEnd: this.intervalEnd.clone(),
            numberOfRows: Math.ceil(c.length / 7),
            intervalStart: this.intervalStart.clone(),
            eventsThisInterval: this.eventsThisInterval,
          });
      else if (this.options.lengthOfTime.months) {
        for (
          t = [], s = 0, n = [], p = 0;
          p < this.options.lengthOfTime.months;
          p++
        ) {
          var l = this.intervalStart.clone().add(p, "months"),
            d = l.clone().endOf("month"),
            c = this.createDaysObject(l, d);
          n.push(this.eventsThisInterval), t.push({ days: c, month: l });
        }
        for (p in t) s += Math.ceil(t[p].days.length / 7);
        a = {
          days: [],
          year: null,
          month: null,
          months: t,
          eventsThisMonth: [],
          numberOfRows: s,
          extras: this.options.extras,
          intervalEnd: this.intervalEnd,
          intervalStart: this.intervalStart,
          daysOfTheWeek: this.daysOfTheWeek,
          eventsLastMonth: this.eventsLastMonth,
          eventsNextMonth: this.eventsNextMonth,
          eventsThisInterval: n,
        };
      } else
        (c = this.createDaysObject(
          this.month.clone().startOf("month"),
          this.month.clone().endOf("month")
        )),
          this.month,
          (a = {
            days: c,
            months: [],
            intervalEnd: null,
            intervalStart: null,
            year: this.month.year(),
            eventsThisInterval: null,
            extras: this.options.extras,
            month: this.month.format("MMMM"),
            daysOfTheWeek: this.daysOfTheWeek,
            eventsLastMonth: this.eventsLastMonth,
            eventsNextMonth: this.eventsNextMonth,
            numberOfRows: Math.ceil(c.length / 7),
            eventsThisMonth: this.eventsThisInterval,
          });
      if (
        (this.options.render
          ? this.calendarContainer.html(this.options.render.apply(this, [a]))
          : this.calendarContainer.html(this.compiledClndrTemplate(a)),
        this.options.constraints)
      ) {
        for (var v in this.options.targets)
          v != this.options.targets.day &&
            this.element
              .find("." + this.options.targets[v])
              .toggleClass(this.options.classes.inactive, !1);
        for (var p in this.constraints) this.constraints[p] = !0;
        this.options.constraints.startDate &&
          (o = e(this.options.constraints.startDate)),
          this.options.constraints.endDate &&
            (i = e(this.options.constraints.endDate)),
          o &&
            (o.isAfter(this.intervalStart) ||
              o.isSame(this.intervalStart, "day")) &&
            (this.element
              .find("." + this.options.targets.previousButton)
              .toggleClass(this.options.classes.inactive, !0),
            (this.constraints.previous = !this.constraints.previous)),
          i &&
            (i.isBefore(this.intervalEnd) ||
              i.isSame(this.intervalEnd, "day")) &&
            (this.element
              .find("." + this.options.targets.nextButton)
              .toggleClass(this.options.classes.inactive, !0),
            (this.constraints.next = !this.constraints.next)),
          o &&
            o.isAfter(h) &&
            (this.element
              .find("." + this.options.targets.previousYearButton)
              .toggleClass(this.options.classes.inactive, !0),
            (this.constraints.previousYear = !this.constraints.previousYear)),
          i &&
            i.isBefore(r) &&
            (this.element
              .find("." + this.options.targets.nextYearButton)
              .toggleClass(this.options.classes.inactive, !0),
            (this.constraints.nextYear = !this.constraints.nextYear)),
          ((o && o.isAfter(e(), "month")) || (i && i.isBefore(e(), "month"))) &&
            (this.element
              .find("." + this.options.targets.today)
              .toggleClass(this.options.classes.inactive, !0),
            (this.constraints.today = !this.constraints.today));
      }
      this.options.doneRendering && this.options.doneRendering.apply(this, []);
    }),
    (n.prototype.bindEvents = function () {
      var e,
        n = this,
        s = t(this.element),
        a = this.options.targets,
        i = n.options.classes,
        o =
          (!0 === this.options.useTouchEvents ? "touchstart" : "click") +
          ".clndr";
      s
        .off(o, "." + a.day)
        .off(o, "." + a.empty)
        .off(o, "." + a.nextButton)
        .off(o, "." + a.todayButton)
        .off(o, "." + a.previousButton)
        .off(o, "." + a.nextYearButton)
        .off(o, "." + a.previousYearButton),
        s.on(o, "." + a.day, function (e) {
          var a,
            o = t(e.currentTarget);
          if (
            (n.options.clickEvents.click &&
              ((a = n.buildTargetObject(e.currentTarget, !0)),
              n.options.clickEvents.click.apply(n, [a])),
            n.options.adjacentDaysChangeMonth &&
              (o.is("." + i.lastMonth)
                ? n.backActionWithContext(n)
                : o.is("." + i.nextMonth) && n.forwardActionWithContext(n)),
            n.options.trackSelectedDate)
          ) {
            if (
              n.options.ignoreInactiveDaysInSelection &&
              o.hasClass(i.inactive)
            )
              return;
            (n.options.selectedDate = n.getTargetDateString(e.currentTarget)),
              s.find("." + i.selected).removeClass(i.selected),
              o.addClass(i.selected);
          }
        }),
        s.on(o, "." + a.empty, function (e) {
          var s,
            a = t(e.currentTarget);
          n.options.clickEvents.click &&
            ((s = n.buildTargetObject(e.currentTarget, !1)),
            n.options.clickEvents.click.apply(n, [s])),
            n.options.adjacentDaysChangeMonth &&
              (a.is("." + i.lastMonth)
                ? n.backActionWithContext(n)
                : a.is("." + i.nextMonth) && n.forwardActionWithContext(n));
        }),
        (e = { context: this }),
        s
          .on(o, "." + a.todayButton, e, this.todayAction)
          .on(o, "." + a.nextButton, e, this.forwardAction)
          .on(o, "." + a.previousButton, e, this.backAction)
          .on(o, "." + a.nextYearButton, e, this.nextYearAction)
          .on(o, "." + a.previousYearButton, e, this.previousYearAction);
    }),
    (n.prototype.buildTargetObject = function (n, s) {
      var a,
        i,
        o = { date: null, events: [], element: n };
      return (
        s &&
          ((a = this.getTargetDateString(n)),
          (o.date = a ? e(a) : null),
          this.options.events &&
            ((i = this.options.multiDayEvents
              ? function () {
                  var t = o.date.isSame(this._clndrStartDateObject, "day"),
                    e = o.date.isAfter(this._clndrStartDateObject, "day"),
                    n = o.date.isSame(this._clndrEndDateObject, "day"),
                    s = o.date.isBefore(this._clndrEndDateObject, "day");
                  return (t || e) && (n || s);
                }
              : function () {
                  return this._clndrStartDateObject.format("YYYY-MM-DD") == a;
                }),
            (o.events = t.makeArray(t(this.options.events).filter(i))))),
        o
      );
    }),
    (n.prototype.getTargetDateString = function (t) {
      var e = t.className.indexOf("calendar-day-");
      return -1 !== e ? t.className.substring(e + 13, e + 23) : null;
    }),
    (n.prototype.triggerEvents = function (t, n) {
      var s,
        a,
        i,
        o,
        r,
        h,
        l,
        d,
        c,
        v = t.options.lengthOfTime,
        p = t.options.clickEvents,
        y = { end: t.intervalEnd, start: t.intervalStart },
        f = [e(t.intervalStart), e(t.intervalEnd)],
        u = [e(t.month)];
      (o =
        y.start.isAfter(n.start) &&
        (1 == Math.abs(y.start.month() - n.start.month()) ||
          (11 === n.start.month() && 0 === y.start.month()))),
        (r =
          y.start.isBefore(n.start) &&
          (1 == Math.abs(n.start.month() - y.start.month()) ||
            (0 === n.start.month() && 11 === y.start.month()))),
        (h =
          y.start.month() !== n.start.month() ||
          y.start.year() !== n.start.year()),
        (s =
          y.start.year() - n.start.year() == 1 ||
          y.end.year() - n.end.year() == 1),
        (a =
          n.start.year() - y.start.year() == 1 ||
          n.end.year() - y.end.year() == 1),
        (i = y.start.year() !== n.start.year()),
        v.days || v.months
          ? ((l = y.start.isAfter(n.start)),
            (d = y.start.isBefore(n.start)),
            (c = l || d),
            l && p.nextInterval && p.nextInterval.apply(t, f),
            d && p.previousInterval && p.previousInterval.apply(t, f),
            c && p.onIntervalChange && p.onIntervalChange.apply(t, f))
          : (o && p.nextMonth && p.nextMonth.apply(t, u),
            r && p.previousMonth && p.previousMonth.apply(t, u),
            h && p.onMonthChange && p.onMonthChange.apply(t, u),
            s && p.nextYear && p.nextYear.apply(t, u),
            a && p.previousYear && p.previousYear.apply(t, u),
            i && p.onYearChange && p.onYearChange.apply(t, u));
    }),
    (n.prototype.back = function (e) {
      var n = arguments.length > 1 ? arguments[1] : this,
        s = n.options.lengthOfTime,
        a = { end: n.intervalEnd.clone(), start: n.intervalStart.clone() };
      return (
        (e = t.extend(!0, {}, { withCallbacks: !1 }, e)),
        n.constraints.previous
          ? (s.days
              ? (n.intervalStart.subtract(s.interval, "days").startOf("day"),
                (n.intervalEnd = n.intervalStart
                  .clone()
                  .add(s.days - 1, "days")
                  .endOf("day")),
                (n.month = n.intervalStart.clone()))
              : (n.intervalStart
                  .subtract(s.interval, "months")
                  .startOf("month"),
                (n.intervalEnd = n.intervalStart
                  .clone()
                  .add(s.months || s.interval, "months")
                  .subtract(1, "days")
                  .endOf("month")),
                (n.month = n.intervalStart.clone())),
            n.render(),
            e.withCallbacks && n.triggerEvents(n, a),
            n)
          : n
      );
    }),
    (n.prototype.backAction = function (t) {
      var e = t.data.context;
      e.backActionWithContext(e);
    }),
    (n.prototype.backActionWithContext = function (t) {
      t.back({ withCallbacks: !0 }, t);
    }),
    (n.prototype.previous = function (t) {
      return this.back(t);
    }),
    (n.prototype.forward = function (e) {
      var n = arguments.length > 1 ? arguments[1] : this,
        s = n.options.lengthOfTime,
        a = { end: n.intervalEnd.clone(), start: n.intervalStart.clone() };
      return (
        (e = t.extend(!0, {}, { withCallbacks: !1 }, e)),
        n.constraints.next
          ? (n.options.lengthOfTime.days
              ? (n.intervalStart.add(s.interval, "days").startOf("day"),
                (n.intervalEnd = n.intervalStart
                  .clone()
                  .add(s.days - 1, "days")
                  .endOf("day")),
                (n.month = n.intervalStart.clone()))
              : (n.intervalStart.add(s.interval, "months").startOf("month"),
                (n.intervalEnd = n.intervalStart
                  .clone()
                  .add(s.months || s.interval, "months")
                  .subtract(1, "days")
                  .endOf("month")),
                (n.month = n.intervalStart.clone())),
            n.render(),
            e.withCallbacks && n.triggerEvents(n, a),
            n)
          : n
      );
    }),
    (n.prototype.forwardAction = function (t) {
      var e = t.data.context;
      e.forwardActionWithContext(e);
    }),
    (n.prototype.forwardActionWithContext = function (t) {
      t.forward({ withCallbacks: !0 }, t);
    }),
    (n.prototype.next = function (t) {
      return this.forward(t);
    }),
    (n.prototype.previousYear = function (e) {
      var n = arguments.length > 1 ? arguments[1] : this,
        s = { end: n.intervalEnd.clone(), start: n.intervalStart.clone() };
      return (
        (e = t.extend(!0, {}, { withCallbacks: !1 }, e)),
        n.constraints.previousYear
          ? (n.month.subtract(1, "year"),
            n.intervalStart.subtract(1, "year"),
            n.intervalEnd.subtract(1, "year"),
            n.render(),
            e.withCallbacks && n.triggerEvents(n, s),
            n)
          : n
      );
    }),
    (n.prototype.previousYearAction = function (t) {
      var e = t.data.context;
      e.previousYear({ withCallbacks: !0 }, e);
    }),
    (n.prototype.nextYear = function (e) {
      var n = arguments.length > 1 ? arguments[1] : this,
        s = { end: n.intervalEnd.clone(), start: n.intervalStart.clone() };
      return (
        (e = t.extend(!0, {}, { withCallbacks: !1 }, e)),
        n.constraints.nextYear
          ? (n.month.add(1, "year"),
            n.intervalStart.add(1, "year"),
            n.intervalEnd.add(1, "year"),
            n.render(),
            e.withCallbacks && n.triggerEvents(n, s),
            n)
          : n
      );
    }),
    (n.prototype.nextYearAction = function (t) {
      var e = t.data.context;
      e.nextYear({ withCallbacks: !0 }, e);
    }),
    (n.prototype.today = function (n) {
      var s = arguments.length > 1 ? arguments[1] : this,
        a = s.options.lengthOfTime,
        i = { end: s.intervalEnd.clone(), start: s.intervalStart.clone() };
      (n = t.extend(!0, {}, { withCallbacks: !1 }, n)),
        (s.month = e().startOf("month")),
        a.days
          ? (a.startDate
              ? (s.intervalStart = e()
                  .weekday(a.startDate.weekday())
                  .startOf("day"))
              : (s.intervalStart = e().weekday(0).startOf("day")),
            (s.intervalEnd = s.intervalStart
              .clone()
              .add(a.days - 1, "days")
              .endOf("day")))
          : ((s.intervalStart = e().startOf("month")),
            (s.intervalEnd = s.intervalStart
              .clone()
              .add(a.months || a.interval, "months")
              .subtract(1, "days")
              .endOf("month"))),
        (s.intervalStart.isSame(i.start) && s.intervalEnd.isSame(i.end)) ||
          s.render(),
        n.withCallbacks &&
          (s.options.clickEvents.today &&
            s.options.clickEvents.today.apply(s, [e(s.month)]),
          s.triggerEvents(s, i));
    }),
    (n.prototype.todayAction = function (t) {
      var e = t.data.context;
      e.today({ withCallbacks: !0 }, e);
    }),
    (n.prototype.setMonth = function (t, e) {
      var n = this.options.lengthOfTime,
        s = {
          end: this.intervalEnd.clone(),
          start: this.intervalStart.clone(),
        };
      return n.days || n.months
        ? (console.log(
            "You are using a custom date interval. Use Clndr.setIntervalStart(startDate) instead."
          ),
          this)
        : (this.month.month(t),
          (this.intervalStart = this.month.clone().startOf("month")),
          (this.intervalEnd = this.intervalStart.clone().endOf("month")),
          this.render(),
          e && e.withCallbacks && this.triggerEvents(this, s),
          this);
    }),
    (n.prototype.setYear = function (t, e) {
      var n = {
        end: this.intervalEnd.clone(),
        start: this.intervalStart.clone(),
      };
      return (
        this.month.year(t),
        this.intervalEnd.year(t),
        this.intervalStart.year(t),
        this.render(),
        e && e.withCallbacks && this.triggerEvents(this, n),
        this
      );
    }),
    (n.prototype.setIntervalStart = function (t, n) {
      var s = this.options.lengthOfTime,
        a = {
          end: this.intervalEnd.clone(),
          start: this.intervalStart.clone(),
        };
      return s.days || s.months
        ? (s.days
            ? ((this.intervalStart = e(t).startOf("day")),
              (this.intervalEnd = this.intervalStart
                .clone()
                .add(s - 1, "days")
                .endOf("day")))
            : ((this.intervalStart = e(t).startOf("month")),
              (this.intervalEnd = this.intervalStart
                .clone()
                .add(s.months || s.interval, "months")
                .subtract(1, "days")
                .endOf("month"))),
          (this.month = this.intervalStart.clone()),
          this.render(),
          n && n.withCallbacks && this.triggerEvents(this, a),
          this)
        : (console.log(
            "You are using a custom date interval. Use Clndr.setIntervalStart(startDate) instead."
          ),
          this);
    }),
    (n.prototype.setEvents = function (t) {
      return (
        this.options.multiDayEvents
          ? (this.options.events = this.addMultiDayMomentObjectsToEvents(t))
          : (this.options.events = this.addMomentObjectToEvents(t)),
        this.render(),
        this
      );
    }),
    (n.prototype.addEvents = function (e) {
      var n = !(arguments.length > 1) || arguments[1];
      return (
        this.options.multiDayEvents
          ? (this.options.events = t.merge(
              this.options.events,
              this.addMultiDayMomentObjectsToEvents(e)
            ))
          : (this.options.events = t.merge(
              this.options.events,
              this.addMomentObjectToEvents(e)
            )),
        n && this.render(),
        this
      );
    }),
    (n.prototype.removeEvents = function (t) {
      for (var e = this.options.events.length - 1; e >= 0; e--)
        1 == t(this.options.events[e]) && this.options.events.splice(e, 1);
      return this.render(), this;
    }),
    (n.prototype.addMomentObjectToEvents = function (t) {
      for (var n = 0; n < t.length; n++)
        (t[n]._clndrStartDateObject = e(t[n][this.options.dateParameter])),
          (t[n]._clndrEndDateObject = e(t[n][this.options.dateParameter]));
      return t;
    }),
    (n.prototype.addMultiDayMomentObjectsToEvents = function (t) {
      for (var n = 0, s = this.options.multiDayEvents; n < t.length; n++) {
        var a = t[n][s.endDate],
          i = t[n][s.startDate];
        a || i
          ? ((t[n]._clndrEndDateObject = e(a || i)),
            (t[n]._clndrStartDateObject = e(i || a)))
          : ((t[n]._clndrEndDateObject = e(t[n][s.singleDay])),
            (t[n]._clndrStartDateObject = e(t[n][s.singleDay])));
      }
      return t;
    }),
    (n.prototype.calendarDay = function (e) {
      var n = {
        day: "",
        date: null,
        events: [],
        classes: this.options.targets.empty,
      };
      return t.extend({}, n, e);
    }),
    (n.prototype.destroy = function () {
      var e = t(this.calendarContainer);
      e.parent().data("plugin_clndr", null),
        (this.options = a),
        e.empty().remove(),
        (this.element = null);
    }),
    (t.fn.clndr = function (t) {
      var e;
      if (this.length > 1)
        throw new Error(
          "CLNDR does not support multiple elements yet. Make sure your clndr selector returns only one element."
        );
      if (!this.length)
        throw new Error("CLNDR cannot be instantiated on an empty selector.");
      return this.data("plugin_clndr")
        ? this.data("plugin_clndr")
        : ((e = new n(this, t)), this.data("plugin_clndr", e), e);
    });
});

/* jquery resize end https://github.com/nielse63/jquery.resizeend/blob/master/lib/jquery.resizeend.min.js*/
!(function (e, n) {
  "object" == typeof exports && "undefined" != typeof module
    ? n()
    : "function" == typeof define && define.amd
      ? define(n)
      : n();
})(0, function () {
  "use strict";
  function e(e) {
    function n() {
      var d = Date.now() - l;
      d < i && d >= 0
        ? (r = setTimeout(n, i - d))
        : ((r = null), t || ((f = e.apply(u, o)), (u = null), (o = null)));
    }
    var i =
        arguments.length > 1 && void 0 !== arguments[1] ? arguments[1] : 100,
      t = arguments[2],
      r = void 0,
      o = void 0,
      u = void 0,
      l = void 0,
      f = void 0,
      d = function () {
        u = this;
        for (var d = arguments.length, a = Array(d), s = 0; s < d; s++)
          a[s] = arguments[s];
        (o = a), (l = Date.now());
        var c = t && !r;
        return (
          r || (r = setTimeout(n, i)),
          c && ((f = e.apply(u, o)), (u = null), (o = null)),
          f
        );
      };
    return (
      (d.clear = function () {
        r && (clearTimeout(r), (r = null));
      }),
      (d.flush = function () {
        r &&
          ((f = e.apply(u, o)),
          (u = null),
          (o = null),
          clearTimeout(r),
          (r = null));
      }),
      d
    );
  }
  var n = window.jQuery;
  if (!n) throw new Error("resizeend require jQuery");
  n.event.special.resizeend = {
    setup: function () {
      var i = n(this);
      i.on(
        "resize.resizeend",
        e.call(
          null,
          function (e) {
            (e.type = "resizeend"), i.trigger("resizeend", e);
          },
          250
        )
      );
    },
    teardown: function () {
      n(this).off("resize.resizeend");
    },
  };
});

/* https://github.com/js-cookie/js-cookie */
!(function (e) {
  var n;
  if (
    ("function" == typeof define && define.amd && (define(e), (n = !0)),
    "object" == typeof exports && ((module.exports = e()), (n = !0)),
    !n)
  ) {
    var t = window.Cookies,
      o = (window.Cookies = e());
    o.noConflict = function () {
      return (window.Cookies = t), o;
    };
  }
})(function () {
  function e() {
    for (var e = 0, n = {}; e < arguments.length; e++) {
      var t = arguments[e];
      for (var o in t) n[o] = t[o];
    }
    return n;
  }
  function n(e) {
    return e.replace(/(%[0-9A-Z]{2})+/g, decodeURIComponent);
  }
  return (function t(o) {
    function r() {}
    function i(n, t, i) {
      if ("undefined" != typeof document) {
        "number" == typeof (i = e({ path: "/" }, r.defaults, i)).expires &&
          (i.expires = new Date(1 * new Date() + 864e5 * i.expires)),
          (i.expires = i.expires ? i.expires.toUTCString() : "");
        try {
          var c = JSON.stringify(t);
          /^[\{\[]/.test(c) && (t = c);
        } catch (e) {}
        (t = o.write
          ? o.write(t, n)
          : encodeURIComponent(String(t)).replace(
              /%(23|24|26|2B|3A|3C|3E|3D|2F|3F|40|5B|5D|5E|60|7B|7D|7C)/g,
              decodeURIComponent
            )),
          (n = encodeURIComponent(String(n))
            .replace(/%(23|24|26|2B|5E|60|7C)/g, decodeURIComponent)
            .replace(/[\(\)]/g, escape));
        var f = "";
        for (var u in i)
          i[u] &&
            ((f += "; " + u), !0 !== i[u] && (f += "=" + i[u].split(";")[0]));
        return (document.cookie = n + "=" + t + f);
      }
    }
    function c(e, t) {
      if ("undefined" != typeof document) {
        for (
          var r = {},
            i = document.cookie ? document.cookie.split("; ") : [],
            c = 0;
          c < i.length;
          c++
        ) {
          var f = i[c].split("="),
            u = f.slice(1).join("=");
          t || '"' !== u.charAt(0) || (u = u.slice(1, -1));
          try {
            var a = n(f[0]);
            if (((u = (o.read || o)(u, a) || n(u)), t))
              try {
                u = JSON.parse(u);
              } catch (e) {}
            if (((r[a] = u), e === a)) break;
          } catch (e) {}
        }
        return e ? r[e] : r;
      }
    }
    return (
      (r.set = i),
      (r.get = function (e) {
        return c(e, !1);
      }),
      (r.getJSON = function (e) {
        return c(e, !0);
      }),
      (r.remove = function (n, t) {
        i(n, "", e(t, { expires: -1 }));
      }),
      (r.defaults = {}),
      (r.withConverter = t),
      r
    );
  })(function () {});
});

/*! jQuery & Zepto Lazy v1.7.10 - http://jquery.eisbehr.de/lazy - MIT&GPL-2.0 license - Copyright 2012-2018 Daniel 'Eisbehr' Kern */
!(function (t, e) {
  "use strict";
  function r(r, a, i, u, l) {
    function f() {
      (L = t.devicePixelRatio > 1),
        (i = c(i)),
        a.delay >= 0 &&
          setTimeout(function () {
            s(!0);
          }, a.delay),
        (a.delay < 0 || a.combined) &&
          ((u.e = v(a.throttle, function (t) {
            "resize" === t.type && (w = B = -1), s(t.all);
          })),
          (u.a = function (t) {
            (t = c(t)), i.push.apply(i, t);
          }),
          (u.g = function () {
            return (i = n(i).filter(function () {
              return !n(this).data(a.loadedName);
            }));
          }),
          (u.f = function (t) {
            for (var e = 0; e < t.length; e++) {
              var r = i.filter(function () {
                return this === t[e];
              });
              r.length && s(!1, r);
            }
          }),
          s(),
          n(a.appendScroll).on("scroll." + l + " resize." + l, u.e));
    }
    function c(t) {
      var i = a.defaultImage,
        o = a.placeholder,
        u = a.imageBase,
        l = a.srcsetAttribute,
        f = a.loaderAttribute,
        c = a._f || {};
      t = n(t)
        .filter(function () {
          var t = n(this),
            r = m(this);
          return (
            !t.data(a.handledName) &&
            (t.attr(a.attribute) || t.attr(l) || t.attr(f) || c[r] !== e)
          );
        })
        .data("plugin_" + a.name, r);
      for (var s = 0, d = t.length; s < d; s++) {
        var A = n(t[s]),
          g = m(t[s]),
          h = A.attr(a.imageBaseAttribute) || u;
        g === N && h && A.attr(l) && A.attr(l, b(A.attr(l), h)),
          c[g] === e || A.attr(f) || A.attr(f, c[g]),
          g === N && i && !A.attr(E)
            ? A.attr(E, i)
            : g === N ||
              !o ||
              (A.css(O) && "none" !== A.css(O)) ||
              A.css(O, "url('" + o + "')");
      }
      return t;
    }
    function s(t, e) {
      if (!i.length) return void (a.autoDestroy && r.destroy());
      for (
        var o = e || i,
          u = !1,
          l = a.imageBase || "",
          f = a.srcsetAttribute,
          c = a.handledName,
          s = 0;
        s < o.length;
        s++
      )
        if (t || e || A(o[s])) {
          var g = n(o[s]),
            h = m(o[s]),
            b = g.attr(a.attribute),
            v = g.attr(a.imageBaseAttribute) || l,
            p = g.attr(a.loaderAttribute);
          g.data(c) ||
            (a.visibleOnly && !g.is(":visible")) ||
            !(
              ((b || g.attr(f)) &&
                ((h === N &&
                  (v + b !== g.attr(E) || g.attr(f) !== g.attr(F))) ||
                  (h !== N && v + b !== g.css(O)))) ||
              p
            ) ||
            ((u = !0), g.data(c, !0), d(g, h, v, p));
        }
      u &&
        (i = n(i).filter(function () {
          return !n(this).data(c);
        }));
    }
    function d(t, e, r, i) {
      ++z;
      var o = function () {
        y("onError", t), p(), (o = n.noop);
      };
      y("beforeLoad", t);
      var u = a.attribute,
        l = a.srcsetAttribute,
        f = a.sizesAttribute,
        c = a.retinaAttribute,
        s = a.removeAttribute,
        d = a.loadedName,
        A = t.attr(c);
      if (i) {
        var g = function () {
          s && t.removeAttr(a.loaderAttribute),
            t.data(d, !0),
            y(T, t),
            setTimeout(p, 1),
            (g = n.noop);
        };
        t.off(I).one(I, o).one(D, g),
          y(i, t, function (e) {
            e ? (t.off(D), g()) : (t.off(I), o());
          }) || t.trigger(I);
      } else {
        var h = n(new Image());
        h.one(I, o).one(D, function () {
          t.hide(),
            e === N
              ? t.attr(C, h.attr(C)).attr(F, h.attr(F)).attr(E, h.attr(E))
              : t.css(O, "url('" + h.attr(E) + "')"),
            t[a.effect](a.effectTime),
            s &&
              (t.removeAttr(u + " " + l + " " + c + " " + a.imageBaseAttribute),
              f !== C && t.removeAttr(f)),
            t.data(d, !0),
            y(T, t),
            h.remove(),
            p();
        });
        var m = (L && A ? A : t.attr(u)) || "";
        h
          .attr(C, t.attr(f))
          .attr(F, t.attr(l))
          .attr(E, m ? r + m : null),
          h.complete && h.trigger(D);
      }
    }
    function A(t) {
      var e = t.getBoundingClientRect(),
        r = a.scrollDirection,
        n = a.threshold,
        i = h() + n > e.top && -n < e.bottom,
        o = g() + n > e.left && -n < e.right;
      return "vertical" === r ? i : "horizontal" === r ? o : i && o;
    }
    function g() {
      return w >= 0 ? w : (w = n(t).width());
    }
    function h() {
      return B >= 0 ? B : (B = n(t).height());
    }
    function m(t) {
      return t.tagName.toLowerCase();
    }
    function b(t, e) {
      if (e) {
        var r = t.split(",");
        t = "";
        for (var a = 0, n = r.length; a < n; a++)
          t += e + r[a].trim() + (a !== n - 1 ? "," : "");
      }
      return t;
    }
    function v(t, e) {
      var n,
        i = 0;
      return function (o, u) {
        function l() {
          (i = +new Date()), e.call(r, o);
        }
        var f = +new Date() - i;
        n && clearTimeout(n),
          f > t || !a.enableThrottle || u ? l() : (n = setTimeout(l, t - f));
      };
    }
    function p() {
      --z, i.length || z || y("onFinishedAll");
    }
    function y(t, e, n) {
      return !!(t = a[t]) && (t.apply(r, [].slice.call(arguments, 1)), !0);
    }
    var z = 0,
      w = -1,
      B = -1,
      L = !1,
      T = "afterLoad",
      D = "load",
      I = "error",
      N = "img",
      E = "src",
      F = "srcset",
      C = "sizes",
      O = "background-image";
    "event" === a.bind || o ? f() : n(t).on(D + "." + l, f);
  }
  function a(a, o) {
    var u = this,
      l = n.extend({}, u.config, o),
      f = {},
      c = l.name + "-" + ++i;
    return (
      (u.config = function (t, r) {
        return r === e ? l[t] : ((l[t] = r), u);
      }),
      (u.addItems = function (t) {
        return f.a && f.a("string" === n.type(t) ? n(t) : t), u;
      }),
      (u.getItems = function () {
        return f.g ? f.g() : {};
      }),
      (u.update = function (t) {
        return f.e && f.e({}, !t), u;
      }),
      (u.force = function (t) {
        return f.f && f.f("string" === n.type(t) ? n(t) : t), u;
      }),
      (u.loadAll = function () {
        return f.e && f.e({ all: !0 }, !0), u;
      }),
      (u.destroy = function () {
        return (
          n(l.appendScroll).off("." + c, f.e), n(t).off("." + c), (f = {}), e
        );
      }),
      r(u, l, a, f, c),
      l.chainable ? a : u
    );
  }
  var n = t.jQuery || t.Zepto,
    i = 0,
    o = !1;
  (n.fn.Lazy = n.fn.lazy =
    function (t) {
      return new a(this, t);
    }),
    (n.Lazy = n.lazy =
      function (t, r, i) {
        if ((n.isFunction(r) && ((i = r), (r = [])), n.isFunction(i))) {
          (t = n.isArray(t) ? t : [t]), (r = n.isArray(r) ? r : [r]);
          for (
            var o = a.prototype.config,
              u = o._f || (o._f = {}),
              l = 0,
              f = t.length;
            l < f;
            l++
          )
            (o[t[l]] === e || n.isFunction(o[t[l]])) && (o[t[l]] = i);
          for (var c = 0, s = r.length; c < s; c++) u[r[c]] = t[0];
        }
      }),
    (a.prototype.config = {
      name: "lazy",
      chainable: !0,
      autoDestroy: !0,
      bind: "load",
      threshold: 500,
      visibleOnly: !1,
      appendScroll: t,
      scrollDirection: "both",
      imageBase: null,
      defaultImage:
        "data:image/gif;base64,R0lGODlhAQABAIAAAP///wAAACH5BAEAAAAALAAAAAABAAEAAAICRAEAOw==",
      placeholder: null,
      delay: -1,
      combined: !1,
      attribute: "data-src",
      srcsetAttribute: "data-srcset",
      sizesAttribute: "data-sizes",
      retinaAttribute: "data-retina",
      loaderAttribute: "data-loader",
      imageBaseAttribute: "data-imagebase",
      removeAttribute: !0,
      handledName: "handled",
      loadedName: "loaded",
      effect: "show",
      effectTime: 0,
      enableThrottle: !0,
      throttle: 250,
      beforeLoad: e,
      afterLoad: e,
      onError: e,
      onFinishedAll: e,
    }),
    n(t).on("load", function () {
      o = !0;
    });
})(window);

/* By André Rinas, www.andrerinas.de Available for use under the MIT License 1.15.0 */
!(function (X, N, Y, t) {
  "use strict";
  X.fn.simpleLightbox = function (p) {
    (p = X.extend(
      {
        sourceAttr: "href",
        overlay: !0,
        spinner: !0,
        nav: !0,
        navText: ["&lsaquo;", "&rsaquo;"],
        captions: !0,
        captionDelay: 0,
        captionSelector: "img",
        captionType: "attr",
        captionsData: "title",
        captionPosition: "bottom",
        captionClass: "",
        close: !0,
        closeText: "×",
        swipeClose: !0,
        showCounter: !0,
        fileExt: "png|jpg|jpeg|gif",
        animationSlide: !0,
        animationSpeed: 250,
        preloading: !0,
        enableKeyboard: !0,
        loop: !0,
        rel: !1,
        docClose: !0,
        swipeTolerance: 50,
        className: "simple-lightbox",
        widthRatio: 0.8,
        heightRatio: 0.9,
        scaleImageToRatio: !1,
        disableRightClick: !1,
        disableScroll: !0,
        alertError: !0,
        alertErrorMessage: "Image not found, next image will be loaded",
        additionalHtml: !1,
        history: !0,
        throttleInterval: 0,
      },
      p
    )),
      N.navigator.pointerEnabled || N.navigator.msPointerEnabled;
    var d,
      t,
      r = 0,
      l = 0,
      h = X(),
      i = function () {
        var t = Y.body || Y.documentElement;
        return "" === (t = t.style).WebkitTransition
          ? "-webkit-"
          : "" === t.MozTransition
            ? "-moz-"
            : "" === t.OTransition
              ? "-o-"
              : "" === t.transition && "";
      },
      g = !1,
      u = [],
      f =
        p.rel && !1 !== p.rel
          ? ((t = p.rel),
            X(this).filter(function () {
              return X(this).attr("rel") === t;
            }))
          : this,
      m = ((i = i()), 0),
      v = !1 !== i,
      n = "pushState" in history,
      x = !1,
      a = N.location,
      c = function () {
        return a.hash.substring(1);
      },
      b = c(),
      y = function () {
        c();
        var t = "pid=" + (I + 1),
          e = a.href.split("#")[0] + "#" + t;
        n
          ? history[x ? "replaceState" : "pushState"]("", Y.title, e)
          : x
            ? a.replace(e)
            : (a.hash = t),
          (x = !0);
      },
      w = function (e, n) {
        var i;
        return function () {
          var t = arguments;
          i ||
            (e.apply(this, t),
            (i = !0),
            setTimeout(function () {
              return (i = !1);
            }, n));
        };
      },
      T = "simplelb",
      e = X("<div>").addClass("sl-overlay"),
      o = X("<button>").addClass("sl-close").html(p.closeText),
      E = X("<div>").addClass("sl-spinner").html("<div></div>"),
      C = X("<div>")
        .addClass("sl-navigation")
        .html(
          '<button class="sl-prev">' +
            p.navText[0] +
            '</button><button class="sl-next">' +
            p.navText[1] +
            "</button>"
        ),
      s = X("<div>")
        .addClass("sl-counter")
        .html(
          '<span class="sl-current"></span>/<span class="sl-total"></span>'
        ),
      S = !1,
      I = 0,
      k = X("<div>").addClass(
        "sl-caption " + p.captionClass + " pos-" + p.captionPosition
      ),
      q = X("<div>").addClass("sl-image"),
      D = X("<div>").addClass("sl-wrapper").addClass(p.className),
      M = function (t) {
        t.trigger(X.Event("show.simplelightbox")),
          p.disableScroll && (m = L("hide")),
          D.appendTo("body"),
          q.appendTo(D),
          p.overlay && e.appendTo(X("body")),
          (S = !0),
          (I = f.index(t)),
          (h = X("<img/>").hide().attr("src", t.attr(p.sourceAttr))),
          -1 == u.indexOf(t.attr(p.sourceAttr)) && u.push(t.attr(p.sourceAttr)),
          q.html("").attr("style", ""),
          h.appendTo(q),
          W(),
          e.fadeIn("fast"),
          X(".sl-close").fadeIn("fast"),
          E.show(),
          C.fadeIn("fast"),
          X(".sl-wrapper .sl-counter .sl-current").text(I + 1),
          s.fadeIn("fast"),
          R(),
          p.preloading && P(),
          setTimeout(function () {
            t.trigger(X.Event("shown.simplelightbox"));
          }, p.animationSpeed);
      },
      R = function (s) {
        if (h.length) {
          var r = new Image(),
            l = N.innerWidth * p.widthRatio,
            c = N.innerHeight * p.heightRatio;
          (r.src = h.attr("src")),
            X(r).on("error", function (t) {
              f.eq(I).trigger(X.Event("error.simplelightbox")),
                (g = !(S = !1)),
                E.hide(),
                p.alertError && alert(p.alertErrorMessage),
                z(1 == s || -1 == s ? s : 1);
            }),
            (r.onload = function () {
              void 0 !== s &&
                f
                  .eq(I)
                  .trigger(X.Event("changed.simplelightbox"))
                  .trigger(
                    X.Event(
                      (1 === s ? "nextDone" : "prevDone") + ".simplelightbox"
                    )
                  ),
                p.history && (x ? (d = setTimeout(y, 800)) : y()),
                -1 == u.indexOf(h.attr("src")) && u.push(h.attr("src"));
              var t = r.width,
                e = r.height;
              if (p.scaleImageToRatio || l < t || c < e) {
                var n = l / c < t / e ? t / l : e / c;
                (t /= n), (e /= n);
              }
              X(".sl-image").css({
                top: (N.innerHeight - e) / 2 + "px",
                left: (N.innerWidth - t - m) / 2 + "px",
              }),
                E.hide(),
                h.css({ width: t + "px", height: e + "px" }).fadeIn("fast"),
                (g = !0);
              var i,
                a =
                  "self" == p.captionSelector
                    ? f.eq(I)
                    : f.eq(I).find(p.captionSelector);
              if (
                ((i =
                  "data" == p.captionType
                    ? a.data(p.captionsData)
                    : "text" == p.captionType
                      ? a.html()
                      : a.prop(p.captionsData)),
                p.loop ||
                  (0 === I && X(".sl-prev").hide(),
                  I >= f.length - 1 && X(".sl-next").hide(),
                  0 < I && X(".sl-prev").show(),
                  I < f.length - 1 && X(".sl-next").show()),
                1 == f.length && X(".sl-prev, .sl-next").hide(),
                1 == s || -1 == s)
              ) {
                var o = { opacity: 1 };
                p.animationSlide &&
                  (v
                    ? (O(0, 100 * s + "px"),
                      setTimeout(function () {
                        O(p.animationSpeed / 1e3, "0px");
                      }, 50))
                    : (o.left =
                        parseInt(X(".sl-image").css("left")) + 100 * s + "px")),
                  X(".sl-image").animate(o, p.animationSpeed, function () {
                    (S = !1), A(i, t);
                  });
              } else (S = !1), A(i, t);
              p.additionalHtml &&
                0 === X(".sl-additional-html").length &&
                X("<div>")
                  .html(p.additionalHtml)
                  .addClass("sl-additional-html")
                  .appendTo(X(".sl-image"));
            });
        }
      },
      A = function (t, e) {
        "" !== t &&
          void 0 !== t &&
          p.captions &&
          k
            .html(t)
            .css({ width: e + "px" })
            .hide()
            .appendTo(X(".sl-image"))
            .delay(p.captionDelay)
            .fadeIn("fast");
      },
      O = function (t, e) {
        var n = {};
        (n[i + "transform"] = "translateX(" + e + ")"),
          (n[i + "transition"] = i + "transform " + t + "s linear"),
          X(".sl-image").css(n);
      },
      W = function () {
        X(N).on("resize." + T, R),
          X(Y).on("click." + T + " touchstart." + T, ".sl-close", function (t) {
            t.preventDefault(), g && H();
          }),
          p.history &&
            setTimeout(function () {
              X(N).on("hashchange." + T, function () {
                g && c() === b && H();
              });
            }, 40),
          C.on(
            "click." + T,
            "button",
            w(function (t) {
              t.preventDefault(),
                (r = 0),
                z(X(this).hasClass("sl-next") ? 1 : -1);
            }, p.throttleInterval)
          );
        var e = 0,
          n = 0,
          i = 0,
          a = 0,
          o = !1,
          s = 0;
        q.on("touchstart." + T + " mousedown." + T, function (t) {
          return (
            !!o ||
            (v && (s = parseInt(q.css("left"))),
            (o = !0),
            (l = r = 0),
            (e = t.originalEvent.pageX || t.originalEvent.touches[0].pageX),
            (i = t.originalEvent.pageY || t.originalEvent.touches[0].pageY),
            !1)
          );
        })
          .on(
            "touchmove." + T + " mousemove." + T + " pointermove MSPointerMove",
            function (t) {
              if (!o) return !0;
              t.preventDefault(),
                (n = t.originalEvent.pageX || t.originalEvent.touches[0].pageX),
                (a = t.originalEvent.pageY || t.originalEvent.touches[0].pageY),
                (r = e - n),
                (l = i - a),
                p.animationSlide &&
                  (v ? O(0, -r + "px") : q.css("left", s - r + "px"));
            }
          )
          .on(
            "touchend." +
              T +
              " mouseup." +
              T +
              " touchcancel." +
              T +
              " mouseleave." +
              T +
              " pointerup pointercancel MSPointerUp MSPointerCancel",
            function (t) {
              if (o) {
                var e = !(o = !1);
                p.loop ||
                  (0 === I && r < 0 && (e = !1),
                  I >= f.length - 1 && 0 < r && (e = !1)),
                  Math.abs(r) > p.swipeTolerance && e
                    ? z(0 < r ? 1 : -1)
                    : p.animationSlide &&
                      (v
                        ? O(p.animationSpeed / 1e3, "0px")
                        : q.animate({ left: s + "px" }, p.animationSpeed / 2)),
                  p.swipeClose &&
                    50 < Math.abs(l) &&
                    Math.abs(r) < p.swipeTolerance &&
                    H();
              }
            }
          );
      },
      P = function () {
        var t = I + 1 < 0 ? f.length - 1 : I + 1 >= f.length - 1 ? 0 : I + 1,
          e = I - 1 < 0 ? f.length - 1 : I - 1 >= f.length - 1 ? 0 : I - 1;
        X("<img />")
          .attr("src", f.eq(t).attr(p.sourceAttr))
          .on("load", function () {
            -1 == u.indexOf(X(this).attr("src")) && u.push(X(this).attr("src")),
              f.eq(I).trigger(X.Event("nextImageLoaded.simplelightbox"));
          }),
          X("<img />")
            .attr("src", f.eq(e).attr(p.sourceAttr))
            .on("load", function () {
              -1 == u.indexOf(X(this).attr("src")) &&
                u.push(X(this).attr("src")),
                f.eq(I).trigger(X.Event("prevImageLoaded.simplelightbox"));
            });
      },
      z = function (e) {
        f.eq(I)
          .trigger(X.Event("change.simplelightbox"))
          .trigger(X.Event((1 === e ? "next" : "prev") + ".simplelightbox"));
        var t = I + e;
        if (!(S || ((t < 0 || t >= f.length) && !1 === p.loop))) {
          (I = t < 0 ? f.length - 1 : t > f.length - 1 ? 0 : t),
            X(".sl-wrapper .sl-counter .sl-current").text(I + 1);
          var n = { opacity: 0 };
          p.animationSlide &&
            (v
              ? O(p.animationSpeed / 1e3, -100 * e - r + "px")
              : (n.left =
                  parseInt(X(".sl-image").css("left")) + -100 * e + "px")),
            X(".sl-image").animate(n, p.animationSpeed, function () {
              setTimeout(function () {
                var t = f.eq(I);
                h.attr("src", t.attr(p.sourceAttr)),
                  -1 == u.indexOf(t.attr(p.sourceAttr)) && E.show(),
                  X(".sl-caption").remove(),
                  R(e),
                  p.preloading && P();
              }, 100);
            });
        }
      },
      H = function () {
        if (!S) {
          var t = f.eq(I),
            e = !1;
          t.trigger(X.Event("close.simplelightbox")),
            p.history &&
              (n
                ? history.pushState("", Y.title, a.pathname + a.search)
                : (a.hash = ""),
              clearTimeout(d)),
            X(
              ".sl-image img, .sl-overlay, .sl-close, .sl-navigation, .sl-image .sl-caption, .sl-counter"
            ).fadeOut("fast", function () {
              p.disableScroll && L("show"),
                X(".sl-wrapper, .sl-overlay").remove(),
                C.off("click", "button"),
                X(Y).off("click." + T, ".sl-close"),
                X(N).off("resize." + T),
                X(N).off("hashchange." + T),
                e || t.trigger(X.Event("closed.simplelightbox")),
                (e = !0);
            }),
            (h = X()),
            (S = g = !1);
        }
      },
      L = function (t) {
        var e = 0;
        if ("hide" == t) {
          var n = N.innerWidth;
          if (!n) {
            var i = Y.documentElement.getBoundingClientRect();
            n = i.right - Math.abs(i.left);
          }
          if (Y.body.clientWidth < n) {
            var a = Y.createElement("div"),
              o = parseInt(X("body").css("padding-right"), 10);
            (a.className = "sl-scrollbar-measure"),
              X("body").append(a),
              (e = a.offsetWidth - a.clientWidth),
              X(Y.body)[0].removeChild(a),
              X("body").data("padding", o),
              0 < e &&
                X("body")
                  .addClass("hidden-scroll")
                  .css({ "padding-right": o + e });
          }
        } else
          X("body")
            .removeClass("hidden-scroll")
            .css({ "padding-right": X("body").data("padding") });
        return e;
      };
    return (
      p.close && o.appendTo(D),
      p.showCounter &&
        1 < f.length &&
        (s.appendTo(D), s.find(".sl-total").text(f.length)),
      p.nav && C.appendTo(D),
      p.spinner && E.appendTo(D),
      f.on("click." + T, function (t) {
        if (
          (function (t) {
            if (!p.fileExt) return !0;
            var e = X(t)
              .attr(p.sourceAttr)
              .match(/\.([0-9a-z]+)(?=[?#])|(\.)(?:[\w]+)$/gim);
            return (
              e &&
              "a" == X(t).prop("tagName").toLowerCase() &&
              new RegExp(".(" + p.fileExt + ")$", "i").test(e)
            );
          })(this)
        ) {
          if ((t.preventDefault(), S)) return !1;
          M(X(this));
        }
      }),
      X(Y).on("click." + T + " touchstart." + T, function (t) {
        g &&
          p.docClose &&
          0 === X(t.target).closest(".sl-image").length &&
          0 === X(t.target).closest(".sl-navigation").length &&
          H();
      }),
      p.disableRightClick &&
        X(Y).on("contextmenu", ".sl-image img", function (t) {
          return !1;
        }),
      p.enableKeyboard &&
        X(Y).on(
          "keyup." + T,
          w(function (t) {
            r = 0;
            var e = t.keyCode;
            S && 27 == e && (h.attr("src", ""), (S = !1), H()),
              g &&
                (t.preventDefault(),
                27 == e && H(),
                (37 != e && 39 != t.keyCode) || z(39 == t.keyCode ? 1 : -1));
          }, p.throttleInterval)
        ),
      (this.open = function (t) {
        (t = t || X(this[0])), M(t);
      }),
      (this.next = function () {
        z(1);
      }),
      (this.prev = function () {
        z(-1);
      }),
      (this.close = function () {
        H();
      }),
      (this.destroy = function () {
        X(Y)
          .off("click." + T)
          .off("keyup." + T),
          H(),
          X(".sl-overlay, .sl-wrapper").remove(),
          this.off("click");
      }),
      (this.refresh = function () {
        this.destroy(), X(this).simpleLightbox(p);
      }),
      this
    );
  };
})(jQuery, window, document);

/* Waypoints - 4.0.0 Copyright Â© 2011-2015 Caleb Troughton Licensed under the MIT license. https://github.com/imakewebthings/waypoints/blob/master/licenses.txt */
!(function () {
  "use strict";
  function t(o) {
    if (!o) throw new Error("No options passed to Waypoint constructor");
    if (!o.element)
      throw new Error("No element option passed to Waypoint constructor");
    if (!o.handler)
      throw new Error("No handler option passed to Waypoint constructor");
    (this.key = "waypoint-" + e),
      (this.options = t.Adapter.extend({}, t.defaults, o)),
      (this.element = this.options.element),
      (this.adapter = new t.Adapter(this.element)),
      (this.callback = o.handler),
      (this.axis = this.options.horizontal ? "horizontal" : "vertical"),
      (this.enabled = this.options.enabled),
      (this.triggerPoint = null),
      (this.group = t.Group.findOrCreate({
        name: this.options.group,
        axis: this.axis,
      })),
      (this.context = t.Context.findOrCreateByElement(this.options.context)),
      t.offsetAliases[this.options.offset] &&
        (this.options.offset = t.offsetAliases[this.options.offset]),
      this.group.add(this),
      this.context.add(this),
      (i[this.key] = this),
      (e += 1);
  }
  var e = 0,
    i = {};
  (t.prototype.queueTrigger = function (t) {
    this.group.queueTrigger(this, t);
  }),
    (t.prototype.trigger = function (t) {
      this.enabled && this.callback && this.callback.apply(this, t);
    }),
    (t.prototype.destroy = function () {
      this.context.remove(this), this.group.remove(this), delete i[this.key];
    }),
    (t.prototype.disable = function () {
      return (this.enabled = !1), this;
    }),
    (t.prototype.enable = function () {
      return this.context.refresh(), (this.enabled = !0), this;
    }),
    (t.prototype.next = function () {
      return this.group.next(this);
    }),
    (t.prototype.previous = function () {
      return this.group.previous(this);
    }),
    (t.invokeAll = function (t) {
      var e = [];
      for (var o in i) e.push(i[o]);
      for (var n = 0, r = e.length; r > n; n++) e[n][t]();
    }),
    (t.destroyAll = function () {
      t.invokeAll("destroy");
    }),
    (t.disableAll = function () {
      t.invokeAll("disable");
    }),
    (t.enableAll = function () {
      t.invokeAll("enable");
    }),
    (t.refreshAll = function () {
      t.Context.refreshAll();
    }),
    (t.viewportHeight = function () {
      return window.innerHeight || document.documentElement.clientHeight;
    }),
    (t.viewportWidth = function () {
      return document.documentElement.clientWidth;
    }),
    (t.adapters = []),
    (t.defaults = {
      context: window,
      continuous: !0,
      enabled: !0,
      group: "default",
      horizontal: !1,
      offset: 0,
    }),
    (t.offsetAliases = {
      "bottom-in-view": function () {
        return this.context.innerHeight() - this.adapter.outerHeight();
      },
      "right-in-view": function () {
        return this.context.innerWidth() - this.adapter.outerWidth();
      },
    }),
    (window.Waypoint = t);
})(),
  (function () {
    "use strict";
    function t(t) {
      window.setTimeout(t, 1e3 / 60);
    }
    function e(t) {
      (this.element = t),
        (this.Adapter = n.Adapter),
        (this.adapter = new this.Adapter(t)),
        (this.key = "waypoint-context-" + i),
        (this.didScroll = !1),
        (this.didResize = !1),
        (this.oldScroll = {
          x: this.adapter.scrollLeft(),
          y: this.adapter.scrollTop(),
        }),
        (this.waypoints = { vertical: {}, horizontal: {} }),
        (t.waypointContextKey = this.key),
        (o[t.waypointContextKey] = this),
        (i += 1),
        this.createThrottledScrollHandler(),
        this.createThrottledResizeHandler();
    }
    var i = 0,
      o = {},
      n = window.Waypoint,
      r = window.onload;
    (e.prototype.add = function (t) {
      var e = t.options.horizontal ? "horizontal" : "vertical";
      (this.waypoints[e][t.key] = t), this.refresh();
    }),
      (e.prototype.checkEmpty = function () {
        var t = this.Adapter.isEmptyObject(this.waypoints.horizontal),
          e = this.Adapter.isEmptyObject(this.waypoints.vertical);
        t && e && (this.adapter.off(".waypoints"), delete o[this.key]);
      }),
      (e.prototype.createThrottledResizeHandler = function () {
        function t() {
          e.handleResize(), (e.didResize = !1);
        }
        var e = this;
        this.adapter.on("resize.waypoints", function () {
          e.didResize || ((e.didResize = !0), n.requestAnimationFrame(t));
        });
      }),
      (e.prototype.createThrottledScrollHandler = function () {
        function t() {
          e.handleScroll(), (e.didScroll = !1);
        }
        var e = this;
        this.adapter.on("scroll.waypoints", function () {
          (!e.didScroll || n.isTouch) &&
            ((e.didScroll = !0), n.requestAnimationFrame(t));
        });
      }),
      (e.prototype.handleResize = function () {
        n.Context.refreshAll();
      }),
      (e.prototype.handleScroll = function () {
        var t = {},
          e = {
            horizontal: {
              newScroll: this.adapter.scrollLeft(),
              oldScroll: this.oldScroll.x,
              forward: "right",
              backward: "left",
            },
            vertical: {
              newScroll: this.adapter.scrollTop(),
              oldScroll: this.oldScroll.y,
              forward: "down",
              backward: "up",
            },
          };
        for (var i in e) {
          var o = e[i],
            n = o.newScroll > o.oldScroll,
            r = n ? o.forward : o.backward;
          for (var s in this.waypoints[i]) {
            var a = this.waypoints[i][s],
              l = o.oldScroll < a.triggerPoint,
              h = o.newScroll >= a.triggerPoint,
              p = l && h,
              u = !l && !h;
            (p || u) && (a.queueTrigger(r), (t[a.group.id] = a.group));
          }
        }
        for (var c in t) t[c].flushTriggers();
        this.oldScroll = { x: e.horizontal.newScroll, y: e.vertical.newScroll };
      }),
      (e.prototype.innerHeight = function () {
        return this.element == this.element.window
          ? n.viewportHeight()
          : this.adapter.innerHeight();
      }),
      (e.prototype.remove = function (t) {
        delete this.waypoints[t.axis][t.key], this.checkEmpty();
      }),
      (e.prototype.innerWidth = function () {
        return this.element == this.element.window
          ? n.viewportWidth()
          : this.adapter.innerWidth();
      }),
      (e.prototype.destroy = function () {
        var t = [];
        for (var e in this.waypoints)
          for (var i in this.waypoints[e]) t.push(this.waypoints[e][i]);
        for (var o = 0, n = t.length; n > o; o++) t[o].destroy();
      }),
      (e.prototype.refresh = function () {
        var t,
          e = this.element == this.element.window,
          i = e ? void 0 : this.adapter.offset(),
          o = {};
        this.handleScroll(),
          (t = {
            horizontal: {
              contextOffset: e ? 0 : i.left,
              contextScroll: e ? 0 : this.oldScroll.x,
              contextDimension: this.innerWidth(),
              oldScroll: this.oldScroll.x,
              forward: "right",
              backward: "left",
              offsetProp: "left",
            },
            vertical: {
              contextOffset: e ? 0 : i.top,
              contextScroll: e ? 0 : this.oldScroll.y,
              contextDimension: this.innerHeight(),
              oldScroll: this.oldScroll.y,
              forward: "down",
              backward: "up",
              offsetProp: "top",
            },
          });
        for (var r in t) {
          var s = t[r];
          for (var a in this.waypoints[r]) {
            var l,
              h,
              p,
              u,
              c,
              d = this.waypoints[r][a],
              f = d.options.offset,
              w = d.triggerPoint,
              y = 0,
              g = null == w;
            d.element !== d.element.window &&
              (y = d.adapter.offset()[s.offsetProp]),
              "function" == typeof f
                ? (f = f.apply(d))
                : "string" == typeof f &&
                  ((f = parseFloat(f)),
                  d.options.offset.indexOf("%") > -1 &&
                    (f = Math.ceil((s.contextDimension * f) / 100))),
              (l = s.contextScroll - s.contextOffset),
              (d.triggerPoint = y + l - f),
              (h = w < s.oldScroll),
              (p = d.triggerPoint >= s.oldScroll),
              (u = h && p),
              (c = !h && !p),
              !g && u
                ? (d.queueTrigger(s.backward), (o[d.group.id] = d.group))
                : !g && c
                  ? (d.queueTrigger(s.forward), (o[d.group.id] = d.group))
                  : g &&
                    s.oldScroll >= d.triggerPoint &&
                    (d.queueTrigger(s.forward), (o[d.group.id] = d.group));
          }
        }
        return (
          n.requestAnimationFrame(function () {
            for (var t in o) o[t].flushTriggers();
          }),
          this
        );
      }),
      (e.findOrCreateByElement = function (t) {
        return e.findByElement(t) || new e(t);
      }),
      (e.refreshAll = function () {
        for (var t in o) o[t].refresh();
      }),
      (e.findByElement = function (t) {
        return o[t.waypointContextKey];
      }),
      (window.onload = function () {
        r && r(), e.refreshAll();
      }),
      (n.requestAnimationFrame = function (e) {
        var i =
          window.requestAnimationFrame ||
          window.mozRequestAnimationFrame ||
          window.webkitRequestAnimationFrame ||
          t;
        i.call(window, e);
      }),
      (n.Context = e);
  })(),
  (function () {
    "use strict";
    function t(t, e) {
      return t.triggerPoint - e.triggerPoint;
    }
    function e(t, e) {
      return e.triggerPoint - t.triggerPoint;
    }
    function i(t) {
      (this.name = t.name),
        (this.axis = t.axis),
        (this.id = this.name + "-" + this.axis),
        (this.waypoints = []),
        this.clearTriggerQueues(),
        (o[this.axis][this.name] = this);
    }
    var o = { vertical: {}, horizontal: {} },
      n = window.Waypoint;
    (i.prototype.add = function (t) {
      this.waypoints.push(t);
    }),
      (i.prototype.clearTriggerQueues = function () {
        this.triggerQueues = { up: [], down: [], left: [], right: [] };
      }),
      (i.prototype.flushTriggers = function () {
        for (var i in this.triggerQueues) {
          var o = this.triggerQueues[i],
            n = "up" === i || "left" === i;
          o.sort(n ? e : t);
          for (var r = 0, s = o.length; s > r; r += 1) {
            var a = o[r];
            (a.options.continuous || r === o.length - 1) && a.trigger([i]);
          }
        }
        this.clearTriggerQueues();
      }),
      (i.prototype.next = function (e) {
        this.waypoints.sort(t);
        var i = n.Adapter.inArray(e, this.waypoints),
          o = i === this.waypoints.length - 1;
        return o ? null : this.waypoints[i + 1];
      }),
      (i.prototype.previous = function (e) {
        this.waypoints.sort(t);
        var i = n.Adapter.inArray(e, this.waypoints);
        return i ? this.waypoints[i - 1] : null;
      }),
      (i.prototype.queueTrigger = function (t, e) {
        this.triggerQueues[e].push(t);
      }),
      (i.prototype.remove = function (t) {
        var e = n.Adapter.inArray(t, this.waypoints);
        e > -1 && this.waypoints.splice(e, 1);
      }),
      (i.prototype.first = function () {
        return this.waypoints[0];
      }),
      (i.prototype.last = function () {
        return this.waypoints[this.waypoints.length - 1];
      }),
      (i.findOrCreate = function (t) {
        return o[t.axis][t.name] || new i(t);
      }),
      (n.Group = i);
  })(),
  (function () {
    "use strict";
    function t(t) {
      this.$element = e(t);
    }
    var e = window.jQuery,
      i = window.Waypoint;
    e.each(
      [
        "innerHeight",
        "innerWidth",
        "off",
        "offset",
        "on",
        "outerHeight",
        "outerWidth",
        "scrollLeft",
        "scrollTop",
      ],
      function (e, i) {
        t.prototype[i] = function () {
          var t = Array.prototype.slice.call(arguments);
          return this.$element[i].apply(this.$element, t);
        };
      }
    ),
      e.each(["extend", "inArray", "isEmptyObject"], function (i, o) {
        t[o] = e[o];
      }),
      i.adapters.push({ name: "jquery", Adapter: t }),
      (i.Adapter = t);
  })(),
  (function () {
    "use strict";
    function t(t) {
      return function () {
        var i = [],
          o = arguments[0];
        return (
          t.isFunction(arguments[0]) &&
            ((o = t.extend({}, arguments[1])), (o.handler = arguments[0])),
          this.each(function () {
            var n = t.extend({}, o, { element: this });
            "string" == typeof n.context &&
              (n.context = t(this).closest(n.context)[0]),
              i.push(new e(n));
          }),
          i
        );
      };
    }
    var e = window.Waypoint;
    window.jQuery && (window.jQuery.fn.waypoint = t(window.jQuery)),
      window.Zepto && (window.Zepto.fn.waypoint = t(window.Zepto));
  })();
