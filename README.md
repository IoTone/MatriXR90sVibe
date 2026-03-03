# Overview

This project was born as a result of a desire to start building Spatial First/XR First suites of applications.  A core to any enterprise is communication.  Matrix offers an imperfect federated communications protocol not owned by companies. It offers a choice where platforms may put your information into the hands of AI or third parties.

As part of XR First, seing your data spatially is the next step in getting the future we promise.  It requires a rethinking of how to present data.  And part of this is: we got real estate.  You have 360 degress of space in the XYZ plane.  

<img width="535" height="621" alt="Image" src="https://github.com/user-attachments/assets/45c42605-2318-4a46-a4e6-98f129037547" />


<img width="1278" height="590" alt="Image" src="https://github.com/user-attachments/assets/faff4cd6-2d8c-4180-bb84-7d44d1ea8ad3" />

## Motivation

I attended a PDX Hacks hackathon today, and they were giving out credits.  I decided, let's build this dream project in 4 hours.  As it turned out, I had 1.5 hours by the time the system was set up and we were done with presentations from speakers.  
 
## References

- http://matrix.org
- https://spec.matrix.org/latest/ 
- Claude Code Meetup Portland x PDX Hacks x AI Collective  https://luma.com/u55aqt1t?tk=5tcIt2

## Design

These are the principles:

- Spatial layout (not HUD)
- Login through 2D flatworld HTML5 (will refer to as flatworld)
- Use WebXR standards so it will run on different devices, in priority: Snap Spectacles, Phone Browser, and Chrome desktop
- Windows in XR should be movable and resizable
- Break free from traditional enterprise layout
- Use audio notifications
- The 90s had a nice vibe, use it

Claude API Opus 4.2 was used to generate a working design.  I did all of the human testing.  Mostly it got the "look" right, and failed on a lot of usability things.  API wise, it needed to figure out problems related to CORS and my deployment.


## Build

- npm run dev

## Test

- num run dev, and follow instructions on the screen for the IP address and port to connect to

## Deploy

- Recommendation is to deploy with a secure SSL certification
- Easiest deployment is via ngrok and localhost: ngrok http https://localhost:5173
- alternative: Deploy using cloudflare pages

## Demo

A demo will be left running at: https://matrixr90svibe.pages.dev

## Getting Started With Matrix

First make sure you set up an account.  Some docs: https://its.h-da.io/element-docs/en/clients/browser/
