import React, { useState, useEffect, useRef } from "react";
import { render } from "react-dom";
import { ApolloProvider, useMutation } from "@apollo/react-hooks";
import { BrowserRouter as Router, Route, Switch } from "react-router-dom";
import { Layout, Affix, Spin } from "antd";
import { Operation } from "apollo-boost";
import { StripeProvider, Elements } from "react-stripe-elements";

import {
  AppHeader,
  Home,
  Host,
  Listing,
  ListingsRoute,
  NotFound,
  User,
  Login,
  Stripe,
} from "./sections";
import { LOG_IN } from "./lib/graphql/mutations";
import {
  LogIn as LogInData,
  LogInVariables,
} from "./lib/graphql/mutations/LogIn/__generated__/LogIn";
import { Viewer } from "./lib/types";
import "./styles/index.css";
import * as serviceWorker from "./serviceWorker";
import { AppHeaderSkeleton, ErrorBanner } from "./lib/components";

const ApolloBoost = require("apollo-boost");

const ApolloClient = ApolloBoost.default;

const client = new ApolloClient({
  uri: "/api",
  request: async (operation: Operation) => {
    const token = sessionStorage.getItem("token");
    operation.setContext({
      headers: {
        "X-CSRF-TOKEN": token || "",
      },
    });
  },
});

const initialViewer: Viewer = {
  id: null,
  token: null,
  avatar: null,
  hasWallet: null,
  didRequest: false,
};

const App = () => {
  const [viewer, setViewer] = useState<Viewer>(initialViewer);
  const [logIn, { error }] = useMutation<LogInData, LogInVariables>(LOG_IN, {
    onCompleted: (data) => {
      if (data && data.logIn) {
        setViewer(data.logIn);

        if (data.logIn.token) {
          sessionStorage.setItem("token", data.logIn.token);
        } else {
          sessionStorage.removeItem("token");
        }
      }
    },
  });

  const logInRef = useRef(logIn);

  useEffect(() => {
    logInRef.current();
  }, []);

  if (!viewer.didRequest && !error) {
    return (
      <Layout className="app-skeleton">
        <AppHeaderSkeleton />
        <div className="app-skeleton__spin-section">
          <Spin size="large" tip="Launching the app" />
        </div>
      </Layout>
    );
  }

  const logInErrorBannerElement = error ? (
    <ErrorBanner description="We weren't able to verify if you were logged in. Please try again later!" />
  ) : null;

  return (
    <StripeProvider apiKey={process.env.REACT_APP_S_PUBLISHABLE_KEY as string}>
      <Router>
        <Layout id="app">
          {logInErrorBannerElement}
          <Affix offsetTop={0} className="app__affix-header">
            <AppHeader viewer={viewer} setViewer={setViewer} />
          </Affix>
          <Switch>
            <Route exact path="/" component={Home} />
            <Route
              exact
              path="/host"
              render={(props) => <Host {...props} viewer={viewer} />}
            />
            <Route
              exact
              path="/listing/:id"
              render={(props) => (
                <Elements>
                  <Listing {...props} viewer={viewer} />
                </Elements>
              )}
            />
            <Route
              exact
              path="/listings/:location?"
              component={ListingsRoute}
            />
            <Route
              exact
              path="/login"
              render={(props) => <Login {...props} setViewer={setViewer} />}
            />
            <Route
              exact
              path="/user/:id"
              render={(props) => (
                <User {...props} viewer={viewer} setViewer={setViewer} />
              )}
            />
            <Route
              exact
              path="/stripe"
              render={(props) => (
                <Stripe {...props} viewer={viewer} setViewer={setViewer} />
              )}
            />
            <Route component={NotFound} />
          </Switch>
        </Layout>
      </Router>
    </StripeProvider>
  );
};

render(
  <ApolloProvider client={client}>
    <App />
  </ApolloProvider>,
  document.getElementById("root")
);

// If you want your app to work offline and load faster, you can change
// unregister() to register() below. Note this comes with some pitfalls.
// Learn more about service workers: https://bit.ly/CRA-PWA
serviceWorker.unregister();
