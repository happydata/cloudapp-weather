## Nomie's Weather App

![](https://snap.icorbin.com/Screen-Shot-2017-01-22-10-12-18.png)

This repo contains the first version of [Nomie's](https://nomie.io) Weather app. The purpose is to showcase building an interactive Nomie app using a single javascript function and AWS Lambda. 

What's a Nomie Cloud App? **[Here's an Overview](https://github.com/happydata/nomie-docs/blob/master/cloud-apps.md)**

(I'm sorry for not having more time to get in to the details, I just wanted to get the code out sooner rather than later.)

# High-level flow

![](http://snap.icorbin.com/add-3rd-party-nomie-cloud-app.png)

# Cloud App Response

When a Cloud App runs, it has a few different ways of interfacing with the user. 

- **HTML** - display a modal that contains XSS filtered HTML (no inline styles, javascript etc)
- **URL** - Display a website either within Nomie's builtin browser, or the users system web browser.
- **Notify** - Display a small toast notification at the bottom of the users screen
- **Commands** - Fire off multiple [Nomie Commands](https://github.com/happydata/nomie-docs/blob/master/nomie-commands.md)

This specific weather app leverages the HTML and Commands.

## HTML Response

![](https://snap.icorbin.com/Screen-Shot-2017-01-22-10-12-52.png)

## Triggering Nomie Commands 

Automatically Tracking the Temp and Humidity 

![](https://snap.icorbin.com/Screen-Shot-2017-01-22-10-16-21.png)
