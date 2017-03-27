/*------------------------------------------------------------------------*
 * Copyright 2013 Arne F. Claassen
 *
 * Licensed under the Apache License, Version 2.0 (the "License");
 * you may not use this file except in compliance with the License.
 * You may obtain a copy of the License at
 *
 *   http://www.apache.org/licenses/LICENSE-2.0

 * Unless required by applicable law or agreed to in writing, software
 * distributed under the License is distributed on an "AS IS" BASIS,
 * WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
 * See the License for the specific language governing permissions and
 * limitations under the License.
 *-------------------------------------------------------------------------*/
(function(root, $, _) {
  Josh.Example = (function(root, $, _) {


    // Enable console debugging, when Josh.Debug is set and there is a console object on the document root.
    var _console = (Josh.Debug && root.console) ? root.console : {
      log: function() {
      }
    };

    // Setup of Shell
    // --------------

    // build the *fake* directory structure used to illustrate path commands and completions.
    var treeroot = buildTree();

    // Create `History` and `KillRing` by hand since we will use the `KillRing` for an example command.
    var history = Josh.History();
    var killring = new Josh.KillRing();

    // Create the `ReadLine` instance by hand so that we can provide it our `KillRing`. Since the shell needs to share
    // the `History` object with `ReadLine` and `Shell` isn't getting to create `ReadLine` automatically as it usually does
    // we need to pass in `History` into `ReadLine` as well.
    var readline = new Josh.ReadLine({history: history, killring: killring, console: _console });

    // Finally, create the `Shell`.
    var shell = Josh.Shell({readline: readline, history: history, console: _console});

    /**
      Set up additional templates.
    */
    shell.templates.is_dir = _.template("<div><%=cmd%>: <%=path%>: Is a directory</div>");


    // Setup PathHandler
    // -----------------

    // `PathHandler` is a mix-in for `Shell` to provide provide the standard unix `ls`, `pwd` and `cd` commands, as well
    // as standard *bash*-style path tab-completion. It expects a `Shell` instance as its first argument so that it can
    // attach its command handlers to the shell as well as overrride the default handler to support completion of path's
    // starting with `.` or `/` without a leading command.
    var pathhandler = new Josh.PathHandler(shell, {console: _console});

    // `PathHandler` operates on path nodes which are expected to be objects with the minimum structure of
    //
    //     {
    //       name: 'localname',
    //       path: '/full/path/to/localname'
    //     }
    //
    // where name is the `name` of the node and `path` is the absolute path to the node. PathHandler does not modify
    // these nodes, so any additional state your implementation requires can be attached to the nodes and be relied on
    // being part of the node when received by the handling methods you implement.
    //
    // The pathhandler expects to be initialized with the current *directory*, i.e. a path node.
    pathhandler.current = treeroot;

    // `PathHandler` requires two method, `getNode` and `getChildNodes`, to be provided in order to operate.
    //
    // `getNode` gets called with *path* string. This string is completely opaque to `PathHandler`, i.e. constructs such
    // as `.` and `..` are an implementation detail. `PathHandler` does assume that the path separator is `/`. `getNode`
    // is called anytime the pathhandler has a path and need to determine what if any node exists at that path which happens
    // during path completion as well as `cd` and `ls` execution.
    pathhandler.getNode = function(path, callback) {
      if(!path) {
        return callback(pathhandler.current);
      }
      var parts = _.filter(path.split('/'), function(x) {
        return x;
      });
      var start = ((path || '')[0] == '/') ? treeroot : pathhandler.current;
      _console.log('start: ' + start.path + ', parts: ' + JSON.stringify(parts));
      return findNode(start, parts, callback);
    };

    // `getChildNodes` is used by path completion to determine the possible completion candidates. Path completion first
    // determines the node for the given path, looking for the nearest `/` in case if the given path does not return a
    // node via `getNode`. For our example, we've attached the child node objects directly to the node object, so we
    // can simply return it. Usually this would be used to call the server with the provided node's path or id so that
    // the appropriate children can be found.
    pathhandler.getChildNodes = function(node, callback) {
      _console.log("children for " + node.name);
      callback(node.childnodes);
    };

    // `findNode` is called recursively from `getNode` with the current node and remaining path already split into
    // segments. It then simply resolves the node for the next segment in `parts` to a node, including relative
    // references like `.` and `..`. In implementations that let you explore an hierarchy on a server, this function
    // would live on the server side and be called remotely via `getNode`.
    function findNode(current, parts, callback) {
      console.log('find node: ', current, parts);
      if(!parts || parts.length == 0) {
        return callback(current);
      }
      if(parts[0] == ".") {

      } else if(parts[0] == "..") {
        current = current.parent;
      } else {
        current = _.first(_.filter(current.childnodes, function(node) {
          return node.name == parts[0];
        }));
      }
      if(!current) {
        return callback();
      }
      return findNode(current, _.rest(parts), callback);
    }

    /*
      Custom cat command.
      Try finding the file specified in args. If it doesn't exist, throw not_found
      error message. If it exists, check that the object is a file (not a directory).
      If so, print the file's contents.
    */
    function cat(cmd, args, callback) {
      console.log('cat', cmd, args);
      pathhandler.getNode(args[0], function(node) {
        console.log(node);
        if (!node) {
          return callback(shell.templates.not_found({cmd: 'cat', path: args[0]}));
        }
        if ('_META_TYPE' in node) {
          if (node['_META_TYPE'] === 'dir') {
            return callback(shell.templates.is_dir({cmd: 'cat', path: args[0]}));
          }
          // print file contents if node is a file
          if (node['_META_TYPE'] === 'file') {
            if ('_META_FILE_CONTENTS' in node) {
              return callback(node['_META_FILE_CONTENTS']);
            }
          }
        }
      })
    }
    shell.setCommandHandler("cat", {
      exec: cat,
      completion: pathhandler.pathCompletionHandler
    });

    // Setup Document Behavior
    // -----------------------

    // Activation and display behavior happens at document ready time.
    $(root).ready(function() {

      // The default name for the div the shell uses as its container is `shell-panel`, although that can be changed via
      // the shell config parameter `shell-panel-id`. The `Shell` display model relies on a 'panel' to contain a 'view'.
      // The 'panel' acts as the view-port, i.e. the visible portion of the shell content, while the 'view' is appended
      // to and scrolled up as new content is added.
      var $consolePanel = $('#shell-panel');

      // attach readline to the shell panel
      readline.attach($consolePanel.get(0));
      $consolePanel.focus();

      // We use **jquery-ui**'s `resizable` to let us drag the bottom edge of the console up and down.
      $consolePanel.resizable({ handles: "s"});
    });

    // We attach the various objects we've created here to `Josh.Instance` purely so they can be inspected via a
    // javascript console. This is not required for the functionality of the example.
    Josh.Instance = {
      Tree: treeroot,
      Shell: shell,
      PathHandler: pathhandler,
    };

    // This code builds our *fake* directory structure. Since most real applications of `Josh` would not keep their
    // entire hierarchy in memory, but instead make callbacks to a server to find nodes and node children, the details
    // of this function are of little interest.

    /**
      Filesystem nodes should include a property called "_META_TYPE" with the value "file" or "dir". Files should hold
      their contents in the property "_META_FILE_CONTENTS".
    */
    function buildTree() {
      var fs = {
        home: {
          "_META_TYPE": "dir",
          "lahacksinfo": {
            "_META_TYPE": "dir",
            "schedule.txt": {
              "_META_TYPE": "file",
              "_META_FILE_CONTENTS": "<table> <tr> <th colspan='2'>Schedule</th> </tr> <tr> <td rowspan='2'>4:00 - 6:00PM</td> <td>SPONSOR CHECK IN<br/>@ Pauley Pavilion NW Entrance</td> </tr> </table>"
            },
            "speakers": {
              "_META_TYPE": "dir",
              "cam-kashani": {
                "_META_TYPE": "dir",
                "bio.txt": {
                  "_META_TYPE": "file",
                  "_META_FILE_CONTENTS": "Known as the \"Godmother of Silicon Beach\", Cam Kashani is a serial entrepreneur having founded three companies, and is also an Expert Speaker with US State Department, all while being a single mother of twin boys. She's worked with over 4000 Entrepreneurs and 700 startups during her career. <br/><br/> Right now, she runs COACCEL, a unique 3-month program that focuses on building powerful, mindful leaders. Previously, she cofounded the first coworking space in Los Angeles, Coloft, which has over 1400 alumni, including Uber LA, Instacart, and Fullscreen.",
                }
              },
              "nick-desai": {
                "_META_TYPE": "dir",
                "bio.txt": {
                  "_META_TYPE": "file",
                  "_META_FILE_CONTENTS": "Nick Desai is a serial tech entrepreneur leading vision, strategy, recruiting, and fundraising for Heal, an on-demand doctor service. He's raised over $47 million in venture capital for his four start-ups since 1998. Most recently, Nick was CEO of FitOrbit – the leader in internet-based weight loss coaching solutions funded by Spark Capital and health insurance giant Anthem Blue Cross. Nick holds a BS in Electrical and Computer Engineering from UC Irvine and an MS in Electrical Engineering from UCLA. ",
                }
              },
              "aza-steel": {
                "_META_TYPE": "dir",
                "bio.txt": {
                  "_META_TYPE": "file",
                  "_META_FILE_CONTENTS": "Aza Steel is the co-founder and CEO of GoGuardian, an education software company that helps educators better connect with students through insights about the way students learn and use the Internet. Aza graduated from UCLA in 2013, and went on to start GoGuardian less than a year after graduation.",
                }
              },
            }
          }
        }
      };

      function build(parent, node) {

        /**
         don't consider META properties as children nodes in the filesystem
        */

        var children = _.omit(node, function(value, key, object) {
          return key.lastIndexOf("_META", 0) === 0;
        });
        parent.childnodes = _.map(_.pairs(children), function(pair) {
          var child = {
            name: pair[0],
            path: parent.path + "/" + pair[0],
            parent: parent
          };

          /**
            Add custom _META fields (dir/file) to child node
          */
          console.log(pair);
          var metaProps = _.omit(pair[1], function(value, key, object) {
            return key.lastIndexOf("_META", 0) !== 0;
          });
          _.extend(child, metaProps);


          if ('_META_TYPE' in child) {
            if (child['_META_TYPE'] === 'dir') {
              /**
                recursively build trees for non-file nodes
              */
              build(child, pair[1]);
            }
          }

          return child;
        });
        parent.children = _.keys(children);
        console.log(parent);
        return parent;
      }
      var tree = build({name: "", path: ""}, fs);
      tree.path = '/';
      return tree;
    }
  })(root, $, _);
})(this, $, _);
