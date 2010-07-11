/*
  Copyright (C) 2010     Paul.W.Harvey@csiro.au, http://trin.org.au
  All Rights Reserved.                  http://www.anbg.gov.au/cpbr

  This program is free software; you can redistribute it and/or
  modify it under the terms of the GNU General Public License
  as published by the Free Software Foundation; either version 2
  of the License, or (at your option) any later version. For
  more details read LICENSE in the root of the Foswiki distribution.

  This program is distributed in the hope that it will be useful,
  but WITHOUT ANY WARRANTY; without even the implied warranty of
  MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.

  As per the GPL, removal of this notice is prohibited.
*/
'use strict';
(function() {
    tinymce.PluginManager.requireLangPack('foswikiclean');

    tinymce.create('tinymce.plugins.FoswikiClean', {
        init: function(ed, url) {
            this._setupCleanButton(ed, url);
            //this._setupCopyButton(ed, url);
            this.stickybits = this._loadStickybits(ed);

            return;
        },

        _getPref: function (key) {
            return foswiki.getPreference('TinyMCECleanStickyBitsPlugin.' + key);
        },

        // Populates a single tag literal/pattern item with 
        // literal/pattern attributes
        _loadStickyAttributes: function(ed, index) {
            var stickyattributes = {
                    attributes: {},
                    attributesNotSticky: {},
                    attributePatterns: []
                },
                _getPref = ed.plugins.foswikiclean._getPref,
                attributeString = _getPref(index + '.attributes'),
                attributePatternsSize = 
                    _getPref(index + '.attributePatterns.size'),
                i = 0;
            
            if (attributeString) {
                jQuery.each(attributeString.split(/,\ */), function (index, value) {
                    stickyattributes.attributes[value] = value;
                });
            }
            if (attributePatternsSize) {
                for (i = 0; i < attributePatternsSize; i = i + 1) {
                    stickyattributes.attributePatterns.push(new
                        RegExp(_getPref(index + '.attributePatterns.' + i)));
                }
            }

            return stickyattributes;
        },

        // Populate the stickybits object with
        // literal tag names and pattern tags with their corresponding literal
        // attributes and pattern attributes
        _loadStickybits: function(ed) {
           var stickybits = { 
                   tags: {},
                   tagPatterns: [],
                   tagsPatternTested: {},
                   tagsNotSticky: {}
               },
               _getPref = ed.plugins.foswikiclean._getPref,
               size = _getPref('size'),
               i,
               tag,
               attributes;

           for (i = 0; i < size; i = i + 1) {
               tag = _getPref(i + '.tag');
               attributes =
                   ed.plugins.foswikiclean._loadStickyAttributes(ed, i);
               /* Populate literal tags */
               if (tag) {
                   stickybits.tags[tag] = attributes;
               } else {
                   /* Populate regex tags */
                   stickybits.tagPatterns.push({
                       pattern: new RegExp(_getPref(i + '.tagpattern')),
                       attributes: attributes.attributes,
                       attributePatterns: attributes.attributePatterns,
                       attributesNotSticky: attributes.attributesNotSticky
                   });
               }
           }

           return stickybits;
        },

        cleanbutton_state: 1, // Set an unrecognised state to force update

        getInfo: function() {
            return {
                longname: 'Foswiki Clean Sticky Bits Plugin',
                author: 'Paul.W.Harvey@csiro.au',
                authorurl: 'http://trin.org.au/HubRIS',
                infourl: 'http://foswiki.org/Extensions/TinyMCECleanStickyBitsPlugin',
                version: 1
            };
        },

        _setupCleanButton: function(ed, url) {

            ed.addCommand('foswikiclean', function() {
                this.plugins.foswikiclean.cleanSelection(ed);

                return;
            });
            ed.addButton('foswikiclean', {
                title: 'foswikiclean.clean_desc',
                cmd: 'foswikiclean',
                image: url + '/img/clean.png'
            });
            // Register nodeChange event to update button state
            ed.onNodeChange.add(this._nodeChangeClean, this);

            return;
        },

        /* Remove all sticky attributes from all selected elements and all
           their descendents
         */
        cleanSelection: function(ed) {
            var range = ed.selection.getRng(true),
                rangeUtils = new tinyMCE.dom.RangeUtils(ed.dom),
                _ed = ed,
                cleanCollection = function(nodes) {
                    jQuery.each(nodes, function(index, node) {
                        tinyMCE.activeEditor.plugins.foswikiclean.
                            _removeStickyAttributes(_ed, node);

                        return;
                    });
                };

            // A selection is collapsed when start = end; ie. selection is the
            // node where the cursor happens to be
            if (ed.selection.isCollapsed()) {
                this._removeStickyAttributes(ed, ed.selection.getNode());
            } else {
                // Eg. the user has highlighted something, so use TinyMCE's
                // DOM range walker to iterate over nodes within the range
                rangeUtils.walk(range, cleanCollection);
            }

            return;
        },

        /* Remove all sticky attributes from all nodes that are descendents
           of the table that is assumed to be an ancestor containing the node
           passed in
           SMELL: assumes node passed in is contained within a table!
           TODO: This doesn't need to be table-specific; make this a generic
                 clean method that can clean any valid selection
         */
        cleanTable: function(ed, node) {
            var tableNode = jQuery(node).closest('table')[0],
                valid_table_children = 'colgroup, thead, tbody, tfoot, col, tr';

            // Remove children of the <table> that WysiwygPlugin can't deal with
            jQuery(tableNode).children(':not(' + valid_table_children + ')').
                empty().remove();
            // Remove invalid children of the valid table children
            if ( jQuery(tableNode).children('tr').length > 0 ) {
                // No <tbody> tag, HTML3 style
                jQuery(tableNode).children('tr').children(':not(th,td)').
                    empty().remove();
            } else {
                jQuery(tableNode).children('tbody').children(':not(tr)').
                    empty().remove();
                jQuery(tableNode).children('tbody').children('tr').
                    children(':not(th,td)').empty().remove();
            }
            // Remove sticky attributes from what's left
            this._removeStickyAttributes(ed, tableNode);

            return;
        },

        // Remove sticky attributes from all descendent nodes and the node
        // passed in
        _removeStickyAttributes: function (ed, node) {
            ed.plugins.foswikiclean._removeStickyAttributesFromNode(
                ed, node);
            jQuery(node).find('*').each(function (index, matchingNode) {
                ed.plugins.foswikiclean._removeStickyAttributesFromNode(
                    ed, matchingNode);
            });

            return;
        },

        // Scan through a node's attributes and remove them if they are known to
        // be sticky
        _removeStickyAttributesFromNode: function(ed, node) {
            var tagName = node.nodeName.toLowerCase(),
                foswikiclean = ed.plugins.foswikiclean,
                nodeattr;
            for (i in node.attributes) {
                if (!isNaN(i)) {
                    nodeattr = node.attributes[i];
                    if (nodeattr && foswikiclean.stickybits.tags[tagName] &&
                        foswikiclean.stickybits.tags[tagName].
                        attributes[nodeattr.nodeName]) {
                        jQuery(node).removeAttr(nodeattr.nodeName);
                    }
                }
            }
        },

        _nodeChangeClean: function(ed, cm, node, collapsed) {
            var foswikiclean = cm.editor.plugins.foswikiclean;
            if (!node) {
                return;
            }

            if ( foswikiclean.edSelectionIsSticky(ed) ) {
                foswikiclean._setCleanButtonState(cm, false, false, false,
                   'foswikiclean.unclean_desc',
                   '/plugins/foswikiclean/img/unclean.png');
            } else {
                foswikiclean._setCleanButtonState(cm, true, true, true,
                   'foswikiclean.clean_desc',
                   '/plugins/foswikiclean/img/clean.png');
            }

            return true;

        },

        // Checks that the nodes in the current selection and all its
        // descendents are free of sticky attributes
        edSelectionIsSticky: function (ed) {
            var isStickyNode = this.isStickyNode,
                descendents,
                sticky = false,
                i, j,
                range = ed.selection.getRng(true),
                rangeUtils = new tinyMCE.dom.RangeUtils(ed.dom),
                isStickyCollection = function (nodes) {
                    if (!sticky) {
                        for (i in nodes) {
                            if (!isNaN(i) && nodes[i]) {
                                if (isStickyNode(ed, nodes[i])) {
                                    sticky = true;
                                } else {
                                    descendents = jQuery(nodes[i]).find('*');
                                    for (j in descendents) {
                                        if (!isNaN(j) && descendents[j] &&
                                            isStickyNode(ed, descendents[j])) {
                                            sticky = true;
                                            break;
                                        }
                                    }
                                }
                                if (sticky) {
                                    break;
                                }
                            }
                        }
                    }

                    return sticky;
                };

            // See comments in cleanSelection()
            if (ed.selection.isCollapsed()) {
                sticky = isStickyNode(ed, ed.selection.getNode());
            } else {
                rangeUtils.walk(range, isStickyCollection);
            }

            return sticky;
        },
        
        // Check that just the node given is sticky
        isStickyNode: function (ed, node) {
            var tagName = node.nodeName.toLowerCase(),
                foswikiclean = ed.plugins.foswikiclean,
                sticky = false;

            if (foswikiclean._hasStickyNodeName(node, tagName) &&
                foswikiclean._hasStickyAttributes(node, tagName)) {
                sticky = true;
            }
            
            return sticky;
        },

        /* Check that a node/tag name should be checked for sticky attributes.
           SMELL: this method is tangled up with _hasStickyAttributes()
         */
        _hasStickyNodeName: function (node, tagName) {
            var stickybits = this.stickybits,
                sticky = false;

            if (!tagName) {
                tagName = node.nodeName.toLowerCase();
            }
            if (stickybits.tags[tagName]) {
                sticky = true;
            } else if (stickybits.tagsNotSticky[tagName]) {
                //sticky = false;
            }
            // if this tag hasn't been matched against the patterns before
            if (!stickybits.tagsPatternTested[tagName]) {
                // Remember
                stickybits.tagsPatternTested[tagName] = true;
                // try to match node name against the regexes
                jQuery(stickybits.tagPatterns).each(
                    function (index, tagPattern) {
                        if (tagPattern.pattern.exec(tagName)) {
                            // Cache this tag name as sticky
                            // Actually, this step is also necessary
                            // to get the (tag) pattern's attributes checked
                            if (typeof(stickybits.tags[tagName]) === 'object') {
                                jQuery.extend(true,
                                    stickybits.tags[tagName], tagPattern);
                            } else {
                                stickybits.tags[tagName] = tagPattern;
                            }
                            sticky = true;
                        }
                    }
                );
                if (!sticky) {
                    // Cache this tag name as not sticky
                    stickybits.tagsNotSticky[tagName] = true;
                    //sticky = false;
                }
            }

            return sticky;
        },

        /* Check a node for sticky attributes
           SMELL: _hasStickyNodeName() really must be called prior to this,
           in order to set up previously unencountered tag/node-names properly
         */
        _hasStickyAttributes: function (node, tagName) {
            var sticky = false,
                stickytag = this.stickybits.tags[tagName],
                i,
                nodeattr,
                checkPattern = function (index, pattern) {
                    if (pattern.exec && pattern.exec(nodeattr)) {
                        // Cache this attribute as sticky
                        stickytag.attributes[nodeattr] = nodeattr;
                        sticky = true;
                    }
                };

            /* For efficiency, assume that most nodes will have no attributes.
               Iterate over node attributes checking against sticky attributes

               If none of the attributes match any of the literal sticky
               attributes, then check against each of the sticky patterns.

               If the check matches, cache as a literal attribute so it's not
               pattern matched again in future.

               If the check doesn't match, cache it into attributesNotSticky
               for the same reason
            */
            if (!tagName) {
                tagName = node.nodeName.toLowerCase();
            }
            for (i in node.attributes) {
                /* After cleaning with jQuery.removeAttr(), node.attributes[i]
                   may still be enumerated but undefined */
                if (!isNaN(i) && node.attributes[i]) {
                    nodeattr = node.attributes[i].nodeName;
                    // If the literal attribute exists for the literal tagname
                    if (stickytag.attributes[nodeattr] !== undefined) {
                        sticky = true;
                        break;
                    } else if (stickytag.attributesNotSticky[nodeattr]) {
                        /* These are our attributes cached as not matching
                           any of this tag's attribute patterns */
                        break;
                    } else {
                        // else try to match the attribute against the regexes
                        if (stickytag.attributePatterns) {
                            jQuery(stickytag.attributePatterns).
                                each(checkPattern);
                        }
                        if (!sticky) {
                            // Cache this attribute as not sticky
                            stickytag.attributesNotSticky[nodeattr] = true;
                            break;
                        }
                    }
                }
            }

            return sticky;
        },

        _setCleanButtonState: function(cm, skipstate, disabled, active, title_key, img) {
            var buttonId, title_value;

            // Skip these checks if the state hasn't changed
            if ( (this.cleanbutton_state !== skipstate) ) {
                buttonId = '#' + cm.prefix + 'foswikiclean';
                title_value = cm.editor.getLang(title_key);
                this.cleanbutton_state = skipstate;
                cm.setDisabled('foswikiclean', disabled);
                cm.setActive('foswikiclean', active);
                jQuery(buttonId).attr('title', title_value);
                cm.controls[cm.prefix + 'foswikiclean'].settings.title = 
                    title_value;
                jQuery(buttonId + ' img').attr('src',
                        cm.editor.baseURI.directory + img);
            }

            return;
        }
    });

    // Register plugin
    tinymce.PluginManager.add('foswikiclean', tinymce.plugins.FoswikiClean);
})();
