import _ from "lodash";
import { getApolloClient } from "./apolloClient";

function optionsEqual(op1, op2) {
    if (_.isEmpty(op1) && _.isEmpty(op2)) {
        return true;
    }
    if (_.isEmpty(op1) || _.isEmpty(op2)) {
        return false;
    }

    return op1.query === op2.query && _.isEqual(op1.variables, op2.variables);
}


export default function withQuery(config = {}) {
    const {
        query: configQuery,
        variables: configVariables,
    } = config;

    const evalQuery = (props, state) => {
        const query = _.isFunction(configQuery) ? configQuery(props, state) : configQuery;
        if (!query) {
            throw new Error("null query!!");
        }
        return query;
    };

    const evalVariables = (props, state) => {
        return _.isFunction(configVariables) ? configVariables(props, state) : configVariables;
    };

    const shouldSkip = (props, state) => {
        const query = evalQuery(props, state);
        if (!query) {
            return true;
        }

        const queryNeedsVariable = !!_.get(query, "definitions.0.variableDefinitions.0");
        return queryNeedsVariable && !evalVariables(props, state);
    };

    return Component => class extends Component {

        constructor() {
            super(...arguments);
            this._queryWatcher = null;
            this._querySubscription = null;
            this._updateResult = _.debounce(this._updateResult, 0);
        }

        componentDidMount() {
            if (super.componentDidMount) {
                super.componentDidMount(...arguments);
            }
            this._watchOrUpdateQuery(this.props, this.state);
        }

        componentDidUpdate() {
            if (super.componentDidUpdate) {
                super.componentDidUpdate(...arguments);
            }
            this._watchOrUpdateQuery(this.props, this.state);
        }

        componentWillUnmount() {
            if (super.componentWillUnmount) {
                super.componentWillUnmount(...arguments);
            }

            if (this._querySubscription) {
                this._querySubscription.unsubscribe();
            }

            delete this._querySubscription;
            delete this._queryWatcher;
        }

        _watchOrUpdateQuery = (props, state) => {
            if (shouldSkip(props, state)) {
                return;
            }

            const options = {
                query: evalQuery(props, state),
                variables: evalVariables(props, state),
            };

            if (optionsEqual(options, this.prevOptions)) {
                return;
            }
            this.prevOptions = { ...options };
            if (this._queryWatcher) {
                this._queryWatcher.setOptions(options);
            } else {
                this._queryWatcher = getApolloClient().watchQuery(options);
                this._querySubscription = this._queryWatcher.subscribe({
                    next: this._updateResult,
                    error: this._updateResult,
                });
            }
            this._updateResult();
        }

        _updateResult = () => {
            if (!this._queryWatcher) {
                return;
            }
            const result = this._queryWatcher.currentResult();
            this.prevProps = _.assign({}, this.props);
            _.assign(this.props, result);
            this._unsafeCallUpdate = true;
            this.setState({}, function () {
                delete this._unsafeCallUpdate;
            });
        }

    };
}