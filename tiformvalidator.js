var _ = require('alloy/underscore')._;
    
var messages = {
    required: 'The %s field is required.',
    matches: 'The %s field does not match the %s field.',
    "default": 'The %s field is still set to default, please change.',
    valid_email: 'The %s field must contain a valid email address.',
    valid_emails: 'The %s field must contain all valid email addresses.',
    min_length: 'The %s field must be at least %s characters in length.',
    max_length: 'The %s field must not exceed %s characters in length.',
    exact_length: 'The %s field must be exactly %s characters in length.',
    greater_than: 'The %s field must contain a number greater than %s.',
    less_than: 'The %s field must contain a number less than %s.',
    alpha: 'The %s field must only contain alphabetical characters.',
    alpha_numeric: 'The %s field must only contain alpha-numeric characters.',
    alpha_dash: 'The %s field must only contain alpha-numeric characters, underscores, and dashes.',
    numeric: 'The %s field must contain only numbers.',
    integer: 'The %s field must contain an integer.',
    decimal: 'The %s field must contain a decimal number.',
    is_natural: 'The %s field must contain only positive numbers.',
    is_natural_no_zero: 'The %s field must contain a number greater than zero.',
    valid_ip: 'The %s field must contain a valid IP.',
    valid_base64: 'The %s field must contain a base64 string.',
    valid_credit_card: 'The %s field must contain a valid credit card number.',
    is_file_type: 'The %s field must contain only %s files.',
    valid_url: 'The %s field must contain a valid URL.'
};

var ruleRegex = /^(.+?)\[(.+)\]$/,
    numericRegex = /^[0-9]+$/,
    integerRegex = /^\-?[0-9]+$/,
    decimalRegex = /^\-?[0-9]*\.?[0-9]+$/,
    emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/,
    alphaRegex = /^[a-z]+$/i,
    alphaNumericRegex = /^[a-z0-9]+$/i,
    alphaDashRegex = /^[a-z0-9_\-]+$/i,
    naturalRegex = /^[0-9]+$/i,
    naturalNoZeroRegex = /^[1-9][0-9]*$/i,
    ipRegex = /^((25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})\.){3}(25[0-5]|2[0-4][0-9]|1[0-9]{2}|[0-9]{1,2})$/i,
    base64Regex = /[^a-zA-Z0-9\/\+=]/i,
    numericDashRegex = /^[\d\-\s]+$/,
    urlRegex = /^((http|https):\/\/(\w+:{0,1}\w*@)?(\S+)|)(:[0-9]+)?(\/|\/([\w#!:.?+=&%@!\-\/]))?$/;

var props = ['controller', 'view', 'fields', 'errorsFilter', 'attrPrefix'];

function findViews(source, needle, deep, context) {    
        
    if(_.isObject(source)) {
        var ch = source.children;
        source = !_.isUndefined(ch) && _.isArray(ch) ? ch : [source];
    } 
    
    if(!_.isArray(source)) {
        throw "Unsupported search source";
    }
    
    var result = _.isFunction(needle) ? _.filter(source, needle, context) : _.where(source, needle);
    if(deep){
        return _.reduce(source, function(memo, view) {
            return memo.concat(findViews(view, needle, true, this));
        }, result, context);
    } else {
        return result;
    }
};

function Validator() {
    var opts;
    if(_.isUndefined(arguments[0]['controller'])) {
        opts = {controller: arguments[0]};
    } else {        
        opts = _(props).zip(arguments).object();
    }
    
    opts = _.extend(this, {
                attrPrefix: 'validator',
                errorsFilter: {ref: "error"},       
            }, _.pick(opts, 'controller', 'view', 'errorsFilter', 'attrPrefix'));
        
    //_.each(opts, function(value, key) { this[key] = value; }, this);
            
    if(_.isUndefined(this.view)) {
        this.view = this.controller.getView();
    }
    
    this.messages = {};
    this.handlers = {};
    this.conditionals = {};
    this.fields = {};
    this.errors = [];
    this.valueGetters = {};
    
    var fields = opts.fields;
    if(_.isEmpty(opts.fields)) {
        fields = this.grabFields();
    }
    
     for (var i = 0, fieldLength = fields.length; i < fieldLength; i++) {
            var field = fields[i];

            // If passed in incorrectly, we need to skip the field.
            if ((!field.id && !field.ids) || !field.rules) {
                continue;
            }

            /*
             * Build the master fields array that has all the information needed to validate
             */

            if (field.ids) {
                for (var j = 0, l = field.ids.length; j < l; j++) {
                    this._addField(field, field.ids[j]);
                }
            } else {
                this._addField(field, field.id);
            }
        }
    
    this.errorViews = _.object(_.map(findViews(this.view, this.errorsFilter, true), 
        function(view) { return [view.for, view];})); 
}

Validator.prototype._getValue = function(field, view) {    
    var getter = this.valueGetters[field.id];
    if(_.isUndefined(getter)) {             
        if(!_.isUndefined(view.value)) {
            return view.value;   
        }         
    } else {
        return getter(field, view);
    }     
};

Validator.prototype.grabFields = function() {
    var propRules = this.getPropertyName('rules');
    
    var views = findViews(this.view, function(view) {
       return !_.isUndefined(view[propRules]);     
    }, true);
    
    var fields = [],    
        props = ['display', 'fields', 'value', 'depends', 'rules'],
        prefixedPprops = _.map(props, this.getPropertyName, this),
    
        reverseMap = _.object(_.zip(prefixedPprops, props));        
        
    var field;
    _.each(views, function(view){
        var p = _.pick(view, ['id'].concat(prefixedPprops));
        field = _.object(
                    _.pairs(p)
                        .map(function(pair){                            
                            pair[0] = reverseMap[pair[0]] || pair[0];
                            return pair;
                            }));
        
        if(!_.isUndefined(field.id) && this.controller.getView(field.id)) {
            fields.push(field);       
        }         
    }, this);
    
    return fields;
};

/*
 * @public
 * Sets a custom message for one of the rules
 */

Validator.prototype.setMessage = function(rule, message) {
    if(_.isObject(rule)) {
        _.extend(this.messages, rule);
    } else {
        this.messages[rule] = message;
    }

    // return this for chaining
    return this;
};

Validator.prototype.setMessages = Validator.prototype.setMessage;

/*
 * @private
 * Adds a file to the master fields array
 */
Validator.prototype._addField = function(field, id)  {
    var id = _.isUndefined(id) ? field.id: id;
    this.fields[id] = {
        id: id,
        display: field.display || id,
        rules: field.rules,
        depends: field.depends,                
        value: null
    };
};

Validator.prototype.getData = function() {    
    return _.object(_.map(this.fields, function(field, id) { 
        return [id, field.value];
        })); 
};

Validator.prototype.validate = function() {
    this.errors = [];

    var fields = this.fields;
    _.each(fields, function(field, key) {
        var field = this.fields[key] || {},
            view = this.controller.getView(field.id);
            
        if(!_.isUndefined(view)) {
            
            field.value = this._getValue(field, view);        

            /*
             * Run through the rules for each field.
             * If the field has a depends conditional, only validate the field
             * if it passes the custom function
             */           

            var validate = true;            
            if (field.depends){
                if(_.isFunction(field.depends)) {
                    validate = field.depends.call(this, field);
                } else if(_.isString(field.depends)) {                 
                    validate = this.conditionals[field.depends] && this.conditionals[field.depends].call(this,field);
                }             
            }
            
            validate && this._validateField(field);
            
        }
    }, this);
   

    if (typeof this.callback === 'function') {
        this.callback(this.errors);
    }   
    
    return this.errors;
};

/*
 * @private
 * Looks at the fields value and evaluates it against the given rules
 */

Validator.prototype._validateField = function(field) {
    
    var rules = field.rules.split('|'),
        indexOfRequired = field.rules.indexOf('required'),
        isEmpty = (!field.value || field.value === '' || field.value === undefined);

    /*
     * Run through the rules and execute the validation methods as needed
     */

    for (var i = 0, ruleLength = rules.length; i < ruleLength; i++) {
        var method = rules[i],
            param = null,
            failed = false,
            parts = ruleRegex.exec(method), 
            handler;      

        /*
         * If the rule has a parameter (i.e. matches[param]) split it out
         */

        if (parts) {
            method = parts[1];
            param = parts[2];
        }

        if (method.charAt(0) === '!') {
            method = method.substring(1, method.length);
        }
        
         /*
         * If this field is not required and the value is empty, continue on to the next rule unless it's a callback.
         * This ensures that a callback will always be called but other rules will be skipped.
         */       

        handler = this.handlers[method];
        if (indexOfRequired === -1 && isEmpty && _.isUndefined(handler) ) {
            continue;
        }

        /*
         * If the hook is defined, run it to find any validation errors
         */

        if (_.isFunction(handler)) {
            if (handler.apply(this, [field.value, param, field]) === false) {
                failed = true;
            }
        } else if (_.isFunction(this._hooks[method])) {
            if (!this._hooks[method].apply(this, [field, param])) {
                failed = true;
            }
        } else {
            throw "Can't find handler for rule: " + rules[i];
        }     

        /*
         * If the hook failed, add a message to the errors array
         */

        if (failed) {
            // Make sure we have a message for this rule
            var source = this.messages[field.id + '.' + method] || this.messages[method] || 
                L('formvalidator_' + method, messages[method]),
                message;

            if (source) {
                message = source.replace('%s', field.display);

                if (param) {
                    message = message.replace('%s', (this.fields[param]) ? this.fields[param].display : param);
                }
            } else {
                message = 'An error has occurred with the ' + field.display + ' field.';
            }

            this.errors.push({                
                field: field,                               
                message: message,
                rule: method
            });

            // Break out so as to not spam with validation errors (i.e. required and valid_email)
            break;
        }
    }
};

/*
 * @public
 * Registers a value getter for specific field view 
 */

Validator.prototype.registerValueGetter = function(id, getter) {
    if (id && typeof id === 'string' && getter && typeof getter === 'function') {
        this.valueGetters[id] = getter;
    }

    // return this for chaining
    return this;
};

/*
 * @public
 * Registers a handler for a custom rule 
 */

Validator.prototype.registerHandler = function(name, handler) {
    if(_.isObject(name)) {
        _.each(name, function(handler, name){
            this.registerHandler(name, handler);
        }, this);
    } else if(_.isString(name) && _.isFunction(handler)) {
        this.handlers[name] = handler;
    }    

    // return this for chaining
    return this;
};

Validator.prototype.registerHandlers = Validator.prototype.registerHandler;

/*
     * @public
     * Registers a conditional for a custom 'depends' rule
     */

Validator.prototype.registerConditional = function(name, conditional) {
    if (name && typeof name === 'string' && conditional && typeof conditional === 'function') {
        this.conditionals[name] = conditional;
    }

    // return this for chaining
    return this;
};

Validator.prototype.getPropertyName = _.memoize(function(name) {            
    if(this.attrPrefix)        
        return this.attrPrefix + name.charAt(0).toUpperCase() + name.slice(1);;
    return name;
});

Validator.prototype.clearError = function(field) {
    var oldHeight = this.getPropertyName('oldHeight');
    var view = this.errorViews[field.id];
    if(view && view.visible) {
        view[oldHeight] = view.height;
        view.height = 0;
        view.visible = false; 
    }
};

Validator.prototype.clearErrors = function() {
    if(_.isFunction(this.onClearErrors)) {
        this.onClearErrors();
    } else {        
        _.each(this.fields, this.clearError, this);
    }    
};

Validator.prototype.showErrors = function() {
        
    if(_.isFunction(this.onShowErrors)) {
        this.onShowErrors();
    } else {
        this.clearErrors();
        
        if(!this.errors.length) {
            return;
        }
        
        var oldHeight = '_' + this.getPropertyName('oldHeight');  
        _.each(this.errors, function showError(error) {
            if(error.field.silent!==true) {
                var errorView = this.errorViews[error.field.id];
                if(!_.isUndefined(errorView)) {
                    errorView.height = _.isUndefined(errorView[oldHeight]) ? Ti.UI.SIZE : errorView[oldHeight];
                    errorView.visible = true;
                    errorView.text = error.message;
                }
            }
        }, this);
    }
};

Validator.prototype.isValid = function() {
    return !this.validate().length;    
};

/*
 * @private
 * Object containing all of the validation hooks
 */

Validator.prototype._hooks = {
    /*
     * returns false if the form element is empty.
     */
    required: function(field) {
        var value = field.value;       
        return (value !== null && value !== '');
    },
    
    "default": function(field, defaultName){
        return field.value !== defaultName;
    },

    /*
     * returns false if the form element value does not match the one in the parameter.
     */
    match: function(field, match) {
        var f = this.fields[match];        
        return f ? (field.value === f.value) : false;        
    },

    /*
     * returns false if the form element value is not a valid email address.
     */
    valid_email: function(field) {
        return emailRegex.test(field.value);
    },

    /*
     * returns false if any value provided in a comma separated list is not a valid email.
     */
    valid_emails: function(field) {
        var result = field.value.split(",");

        for (var i = 0, l = result.length; i < l; i++) {
            if (!emailRegex.test(result[i])) {
                return false;
            }
        }

        return true;
    },

    /*
     * returns false if the form element value is shorter than the parameter.
     */
    min_length: function(field, length) {
        if (!numericRegex.test(length)) {
            return false;
        }

        return (field.value.length >= parseInt(length, 10));
    },

    /*
     * returns false if the form element value is longer than the parameter.
     */
    max_length: function(field, length) {
        if (!numericRegex.test(length)) {
            return false;
        }

        return (field.value.length <= parseInt(length, 10));
    },

    /*
     * returns false if the form element value length is not exactly the parameter.
     */
    exact_length: function(field, length) {
        if (!numericRegex.test(length)) {
            return false;
        }

        return (field.value.length === parseInt(length, 10));
    },

    /*
     * returns false if the form element value is less than the parameter after using parseFloat.
     */
    greater_than: function(field, param) {
        if (!decimalRegex.test(field.value)) {
            return false;
        }

        return (parseFloat(field.value) > parseFloat(param));
    },

    /*
     * returns false if the form element value is greater than the parameter after using parseFloat.
     */
    less_than: function(field, param) {
        if (!decimalRegex.test(field.value)) {
            return false;
        }

        return (parseFloat(field.value) < parseFloat(param));
    },

    /*
     * returns false if the form element contains anything other than alphabetical characters.
     */
    alpha: function(field) {
        return (alphaRegex.test(field.value));
    },

    /*
     * returns false if the form element contains anything other than alpha-numeric characters.
     */
    alpha_numeric: function(field) {
        return (alphaNumericRegex.test(field.value));
    },
    
    /*
     * returns false if the form element contains anything other than alphanumeric characters, underscores, or dashes.
     */
    alpha_dash: function(field) {
        return (alphaDashRegex.test(field.value));
    },

    /*
     * returns false if the form element contains anything other than numeric characters.
     */
    numeric: function(field) {
        return (numericRegex.test(field.value));
    },

    /*
     * returns false if the form element contains anything other than an integer.
     */
    integer: function(field) {
        return (integerRegex.test(field.value));
    },

    /*
     * returns false if the form element contains anything other than a decimal.
     */
    decimal: function(field) {
        return (decimalRegex.test(field.value));
    },

    /*
     * returns false if the form element contains anything other than a natural number: 0, 1, 2, 3, etc.
     */
    is_natural: function(field) {
        return (naturalRegex.test(field.value));
    },

    /*
     * returns false if the form element contains anything other than a natural number, but not zero: 1, 2, 3, etc.
     */
    is_natural_no_zero: function(field) {
        return (naturalNoZeroRegex.test(field.value));
    },

    /*
     * returns false if the supplied IP is not valid.
     */
    valid_ip: function(field) {
        return (ipRegex.test(field.value));
    },

    /*
     * returns false if the supplied string contains anything other than valid Base64 characters.
     */
    valid_base64: function(field) {
        return (base64Regex.test(field.value));
    },

    /*
     * returns false if the supplied string is not a valid url
     */
    valid_url: function(field) {
        return (urlRegex.test(field.value));
    },

    /*
     * returns false if the supplied string is not a valid credit card
     */
    valid_credit_card: function(field){
        // Luhn Check Code from https://gist.github.com/4075533
        // accept only digits, dashes or spaces
        if (!numericDashRegex.test(field.value)) return false;

        // The Luhn Algorithm. It's so pretty.
        var nCheck = 0, nDigit = 0, bEven = false;
        var strippedField = field.value.replace(/\D/g, "");

        for (var n = strippedField.length - 1; n >= 0; n--) {
            var cDigit = strippedField.charAt(n);
            nDigit = parseInt(cDigit, 10);
            if (bEven) {
                if ((nDigit *= 2) > 9) nDigit -= 9;
            }

            nCheck += nDigit;
            bEven = !bEven;
        }

        return (nCheck % 10) === 0;
    },

    /*
     * returns false if the supplied value is not part of the comma separated list in the paramter
     */
    is_any: function(field, param) {
        return param.split(',').indexOf(field.value) != -1;
    },
    
    /*
     * returns false if the supplied file is not part of the comma separated list in the paramter
     */
    is_file_type: function(field, type) {       
        return type.split(',').indexOf(field.value.substr((field.value.lastIndexOf('.') + 1))) != -1;
    }
};


module.exports = Validator;
