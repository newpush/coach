# 🚀 Coach Watts Update: v0.5.7 is Live!

We've been hard at work behind the scenes to make your training analysis smarter, faster, and easier to understand. This release focuses heavily on improving the workout recommendation engine, enhancing data clarity, and strengthening overall platform stability.

Here is what's new in version 0.5.7:

---

### 🧠 Smarter Coaching & Personalized Workouts

We’ve significantly upgraded the logic behind your personalized training suggestions.

- **Goal-Driven Recommendations:** The workout generation engine is now smarter! It actively considers your **active training goals** when suggesting modifications or new sessions, ensuring every recommendation is directly aligned with where you want to go.
- **Seamless Acceptance:** We've polished the look and feel of your recommendation cards on the Dashboard. You can now **Accept** a suggested workout with a single click, immediately incorporating it into your plan.
- **Ad-Hoc Workout Generation:** For coaches and athletes needing quick flexibility, we've added endpoints to instantly generate new workouts based on context and feedback.

### 📊 Data Clarity & Analysis Upgrades

Understanding complex performance metrics shouldn't require a textbook. We've introduced tooltips across the platform to help you instantly grasp key training concepts.

- **Metric Tooltips Everywhere!** 💡 We’ve added consistent, helpful tooltips across workout analysis pages, the share page, and efficiency cards. If you're unsure what a metric like **Aerobic Decoupling** means, just hover over it for a clear definition.
- **Accurate Pacing for Uploaded Files:** When manually uploading .FIT files (especially useful for runs or outdoor rides), we now correctly calculate and display all critical **pacing metrics** like speed and distance.
- **Decoupling Fix:** We corrected the calculation and display logic for Aerobic Decoupling to ensure you are getting the most accurate assessment of your endurance efficiency during workouts.
- **Dashboard Polish:** The "Analyze" button and data syncing process on your dashboard are now more robust and reliable.

### ⚠️ Important Note: Temporary Strava Integration Pause

For stability and security purposes related to some underlying architecture updates, we have temporarily **disabled the Strava integration** on the main hosted version of Coach Watts (v0.5.7).

- **What this means:** You will not be able to sync new activities directly from Strava until we re-enable the feature in a subsequent update.
- **Workaround:** Please continue to use your preferred platform (Garmin, Wahoo, etc.) to upload activities, or manually upload .FIT files directly to Coach Watts.
- We prioritize reliable data synchronization and expect to restore Strava functionality soon!

---

Happy Training!

# Coach Watts App Update: v0.5.6 is Live! 🚀

Hello athletes and coaches! We've just pushed a major update focused on powerful new data connections, stability, and a polished look.

Here’s what’s new in v0.5.6:

## 🔗 Seamless Data Integration: Intervals.icu is Here!

The biggest news is the full integration with **Intervals.icu**!

- **New Connection:** You can now connect your Coach Watts account directly with Intervals.icu using OAuth for secure and seamless data sharing.
- **Rock-Solid Stability:** We have made significant improvements to ensure your connection remains reliable. If Intervals.icu is busy, our system is now smart enough to automatically retry syncing your data later without errors.
- **Clean Disconnects:** If you ever need to unlink your account, the disconnection process is now instant and complete.

## 🛠 Reliability & Usability Upgrades

We’ve fine-tuned several areas to make your daily experience faster and smoother:

- **Instant Activity Sync:** The **Refresh button** on your Activities page now reliably forces a data sync with your connected apps, ensuring you see the latest workout results immediately.
- **Improved Heart Rate Data:** We standardized how heart rate data is handled across the dashboard and API for complete consistency.
- **New Connected App Logos:** Head over to the Connected Apps settings to see slick new logos for **Strava, WHOOP, Hevy**, and others, making navigation cleaner and easier!

## ✨ Polished Look & Transparency

We've focused on making the Coach Watts platform look even better:

- **Fresh Look:** You'll notice updated branding and logos throughout the sidebar and home page.
- **Changelog Page:** Want to know what's new anytime? We've added a dedicated **Changelog page** within your Settings, so you can always review the latest app updates!

Update your app or refresh your browser to see all the improvements! Happy cycling! 🚴‍♀️💨

# ✨ Coach Watts Release v0.5.5: Did You Hit Your Plan?

We're thrilled to announce v0.5.5, a major update focused on helping you bridge the gap between planning and execution. This release introduces a powerful new layer of analytics to track exactly how well you adhered to your training plan!

Here’s what’s new and improved:

---

## 🚀 Game-Changing New Features

### 🎯 Plan Adherence & Linking (Huge Upgrade!)

We know it can be tough to compare what you planned versus what you actually did. This release makes plan tracking seamless:

- **Plan Adherence Score (NEW!):** See a detailed score on your completed workout pages that instantly tells you how closely you followed the prescribed structure (duration, intensity, and structure). No more guessing!
- **Drag-and-Drop Linking:** Link your completed ride file directly to its corresponding planned workout slot using intuitive drag-and-drop on the calendar. 🔗
- **Enhanced Visibility:** Calendar and Quick View screens now clearly display the details of the planned workout linked to your activity, along with easy options to unlink or manage them.
- **Data Cleanup:** If you happen to upload a ride twice, you can now easily promote the best file as the primary workout, keeping your activity log clean.

### 💪 Smarter Training Analysis

- **Improved TSS Accuracy:** We have refined the underlying formulas used to estimate Training Stress Score (TSS) and overall workload, providing you with more precise and reliable training load data.
- **Expanded Training Zones:** Our analysis tools now support up to Z7 and Z8 (Training Peaks model), offering coaches and athletes better compatibility for advanced training methodologies.

---

## 💡 Quality of Life Improvements

- **Better Weekly Reports:** Your weekly summary reports now include detailed tracking data for your active goals, giving you a comprehensive view of your progress. 📈
- **Reliable Sharing:** We’ve overhauled the backend for sharing workouts, ensuring that your share links are more robust and reliable.
- **Integration Sync Control:** Syncing data from your devices is faster and smarter, with new controls for syncing specific date ranges.

---

## 🛠️ Stability & Bug Fixes

We took time to stabilize the application by addressing several technical debt items and squashing annoying bugs:

- **Smoother UI:** We fixed several visual glitches related to colors, badges, and button displays across the platform, especially within the workout modal and quick-view components.
- **Backend Stability:** General improvements were made to ensure a smoother, more reliable experience across the app. 🪲

Update your app and check out your new Plan Adherence scores! Happy training!
— The Coach Watts Team

# 🚀 Coach Watts Update: v0.5.5 is Here!

Hello Athletes and Coaches!

We're thrilled to release our latest update, packed with powerful new features that bring unprecedented clarity to your training execution and data management. This release is all about making the connection between what you _plan_ and what you _do_ seamless and insightful!

---

## 🎯 Plan Your Success: New Coaching Insights

We’ve introduced major features designed to help you analyze execution and keep your training on track:

### 🌟 New Feature: Plan Adherence

You can now instantly measure how well you followed your training prescription!

- **Execution Score:** See a clear percentage score showing how closely your completed workout matched the structure, duration, and intensity of your planned session.
- **Detailed Analysis:** Plan adherence scores are now visible in workout details and share pages, giving you and your coach deeper insights into your execution.

### 🔗 Better Workout Linking

We've made connecting your completed activity to your planned workout smoother than ever:

- **Drag-and-Drop Linking:** Associate a completed workout with your scheduled plan directly on the calendar using simple drag-and-drop. No more digging through menus!
- **Clear Calendar View:** Calendar entries and quick views now clearly display which planned workout a completed activity is linked to.
- **Unlink Option:** Made a mistake? You can now easily unlink a planned workout from its completed activity.

### 📊 Data Management & Flexibility

- **Promote Primary Workout:** If you have duplicate activity data synced from different sources, you can now easily select and promote the best version to be your primary workout record.
- **Expanded Training Zones:** We now support up to Z7/Z8 zones, offering greater detail and flexibility for high-end intensity and interval analysis.

---

## ✅ Accuracy & Performance Improvements

We’ve refined core calculations and processes to ensure your data is always reliable:

- **Smarter Stress Calculation:** We've made crucial improvements to the Training Stress Score (TSS) and training load estimation formulas for greater accuracy and reliability across all activities.
- **Enhanced Weekly Reports:** Your weekly reports now include more comprehensive data, including information about your active goals.
- **Robust Sharing:** Workout sharing links are now more secure and reliable thanks to backend refactoring.

---

## 🛠 Stability and Polish

We squashed several small bugs and improved component stability for a better user experience:

- **UI Polish:** We resolved several visual glitches, color inconsistencies, and layout issues in workout quick views, modals, and badge displays across the app.
- **Better Data Tracking:** We improved internal tracking for missing important fields, like Heart Rate and Custom Zones, helping ensure better data completeness over time.

Happy riding!

— The Coach Watts Team 🚴‍♀️💨

👋 Hello Athletes and Coaches!

We've just pushed **v0.5.4**, bringing some powerful new visualizations and important data accuracy improvements to your training analysis. Dive into the details below!

---

## What’s New in Coach Watts (v0.5.4) ✨

### 1. New Visual Training Insights 📈

Analyzing your efforts just got a whole lot easier!

- **Zone Visualization Charts:** We've added a fantastic new component that graphically displays your workout run. You can now clearly see how your effort was distributed across your customized training zones (Power, Heart Rate, etc.) throughout the session. Get instant, visual feedback on your pacing and execution!

### 2. Smarter Data & Transparency 💡

We believe in clear, accurate data you can trust.

- **Score Clarity:** No more guessing games! We now provide clear explanations accompanying your workout performance scores. You'll know exactly _why_ you received that rating, making the feedback immediately more actionable.
- **Accurate Running Metrics:** We fixed an important conversion issue to ensure that your running cadence is calculated perfectly as Steps Per Minute (SPM). Runners, your data is now spot-on! 🏃‍♀️

### 3. Stability & Reliability Improvements 🛠️

We've been busy tidying up behind the scenes to keep Coach Watts running smoothly.

- **Smoother Workouts:** We fixed a bug that occasionally caused duplicate lines or errors during workout processing and conversion, ensuring your structured workouts load cleanly every time.
- **System Health:** We’ve implemented new internal monitoring tools to help us detect and address performance issues faster, keeping the entire platform reliable as we scale.

---

Happy Training!

The Coach Watts Team 🚴‍♀️

# 🎉 Coach Watts v0.5.3: Syncing, Stats, and Smarter Updates!

Hey team! We've just rolled out a fantastic new update focused on integrating with your favorite tools and providing you with instant performance insights.

Here’s what’s new in v0.5.3:

---

## 🔗 Major Integration: Intervals.icu Workout Sync!

This is the feature you’ve been asking for! Coach Watts now plays nicely with Intervals.icu, making your planning workflow smoother than ever.

- **Instant Publishing:** You can now instantly sync your planned workouts from your Coach Watts dashboard directly onto your Intervals.icu calendar.
- **How it Works:** Just look for the new **'Publish' button** on your plan dashboard. A quick click is all it takes to push your training plan over! 🔄

## 📈 Enhanced Performance Metrics

Get a clearer picture of your current fitness and fatigue level right on your profile.

- **Key Training Insights:** We’ve added key cycling metrics, including **Training Load (CTL)** and **Form (TSB)**, directly to the Athlete Profile and Dashboard.
- **Track Your Freshness:** Coaches and athletes can now instantly see if the plan is working and how fresh (or fatigued) the athlete is for the next big session. 📊

## 💡 Better App Experience

We've improved how we communicate new features and updates to you.

- **In-App Release Notes:** You will now receive a dedicated notification on your dashboard when a new version of Coach Watts is released.
- **Stay Updated:** Read all the exciting changes and new features in a simple pop-up modal, without ever having to leave the application. 📰

Happy Cycling!

— The Coach Watts Team 🚴‍♀️💨

# 🎉 Coach Watts v0.5.3: Sync Your Plan & Track Your Form!

Hey Coach Watts Community!

We're thrilled to launch v0.5.3, focused entirely on streamlining your workflow and giving you better insights into your fitness. This update includes a major integration many of you have been waiting for!

Here are the highlights of what’s new:

---

## 🚀 Seamless Intervals.icu Integration

For athletes and coaches who rely on Intervals.icu for tracking and analysis, your workflow just became _much_ easier!

- **One-Click Publishing:** You can now publish your planned workouts from Coach Watts directly onto your Intervals.icu calendar with a single button press on the plan dashboard. No more manual exports or data entry!
- **Optimized Format:** We handle all the technical conversions to ensure your structured workouts display perfectly inside Intervals.icu.

## 📈 Enhanced Performance Metrics

Get a clearer picture of your physical status right inside your athlete profile.

- **Training Load & Form:** Your Athlete Profile now features essential training metrics (often referred to as CTL/ATL/TSB) that show your current **Training Load** (Fitness) and **Form** (Freshness/Fatigue). Use these visual cues to train smarter, not just harder!

## 📢 Stay Up-to-Date

We want to make sure you never miss out on new features or critical updates.

- **New Release Notifications:** We’ve added a prominent notification system to the dashboard header. When we release a new version, you’ll see the latest notes immediately, so you always know what improvements we’ve rolled out!

---

Log in today and try out the new **Publish** button on your training plan dashboard! Happy cycling! 🚴💨

— The Coach Watts Team

# 🎉 Coach Watts v0.5.2 is Live! More Precision, More Control

We’re excited to roll out v0.5.2, focusing on bringing a key performance metric to your profile and giving you greater control over your automatic settings. Update your app now to check out the improvements!

## ❤️ New Performance Metrics

### **Track Your Lactate Threshold Heart Rate (LTHR)**

You asked, and we delivered! You can now input and track your **Lactate Threshold Heart Rate (LTHR)** directly in your Profile Settings.

This crucial metric allows Coach Watts to calculate your personalized heart rate training zones with much greater accuracy, helping you dial in your workouts for maximum benefit!

## 🧠 Smarter Profile Updates

### **You're in Control of Auto-Detection**

Coach Watts often uses your activity data to detect new performance benchmarks (like a change in FTP or Weight). We’ve made this process clearer and safer than ever:

- **Confirmation Modal:** If we detect a potential update to your profile settings, you will now see a clear confirmation screen.
- **Diff Detection:** This screen explicitly shows you _exactly_ what the change is (e.g., "FTP changing from 250W to 255W") before you approve it.

This ensures you are always aware of, and in full control of, the settings Coach Watts uses for your training plans. ✅

## ⚙️ Stability & Chart Improvements

We’ve ironed out a couple of technical kinks to ensure a smoother experience:

- **Accurate Charts:** We fixed an issue where some performance charts (like the CTL/ATL/TSB graph) occasionally tried to calculate or display data far into the future unnecessarily. Your charts now reflect current and relevant performance data more reliably.
- **Snappier Data:** General optimizations to how we fetch interval data mean quicker loading times and a more responsive app experience. 🚀

---

Happy Cycling!

— The Coach Watts Team

# 🚀 Coach Watts v0.5.1 is Here! Faster, Cleaner, and More Reliable 📈

We’ve just rolled out a fresh update focused on providing a smoother planning experience and ensuring your training data is perfectly accurate.

Here is what's new for our athletes and coaches:

---

### ✨ New Planning & Interface Features

We’ve added powerful tools to help you manage and understand your training plans at a glance:

- **Deep Dive into Plans 🔎**
  Viewing long, complex training plans is now much easier! We introduced a new detail viewer with smooth **pagination and a fullscreen modal**, making it simple to scroll through every session.
- **Plan Statistics at Your Fingertips**
  When viewing your list of training plans, you can now see quick statistics (like total duration or anticipated stress load) right away. This makes plan selection and comparison much faster for coaches.
- **Instant Access to Chat 💬**
  We added a prominent **Chat Button to the dashboard header**, giving you faster access to support or coach messaging. Plus, we tidied up the layout to look even better on your phone!
- **Fresh Start Option 🗑️**
  Need to completely reset your training history and start data collection over? You now have the option within the UI to **wipe your profile data**, giving you total control over your coaching journey.

---

### ✅ Reliability & Data Accuracy Fixes

We took a deep dive into the engine room to squash some bugs that were throwing off training load calculations and data reporting. Your metrics are now more trustworthy than ever!

- **No More Duplicate Workouts! 🚫**
  We fixed an issue that occasionally created duplicate planned activities, which could artificially inflate your scheduled training stress. Your calendar will now stay clean, and your stress calculations (like CTL) will be spot on.
- **Clearer Weekly Summaries**
  Your weekly summary dashboards now cleanly **separate completed activities from planned activities**. You get an accurate view of what you actually accomplished versus what the schedule called for.
- **Metrics You Can Trust 🎯**
  We implemented smarter filtering to ensure that any stray or duplicate workouts are completely ignored when calculating your overall training metrics. Get back to trusting your Chronic Training Load (CTL) and Form (TSB)!

---

Happy Cycling! 🚴‍♀️💨

— The Coach Watts Team

# Watts App Release v0.5.0: The Planning & Personalization Update! 🚀

We've been hard at work building the next generation of coaching tools, and v0.5.0 brings massive improvements to how you plan, execute, and analyze your training. This release introduces a powerful new event-driven planning system and smarter AI integration to make your weekly schedule more flexible and targeted than ever before.

Here’s what’s new and improved for your training success:

---

## 🎯 Next-Level Planning & Event Focus

Setting your sights on a big race or event? Watts can now build your entire plan around it!

- **Event-Driven Periodization:** Simply set your key race dates, and our system will automatically create sophisticated training phases (Base, Build, Peak) tailored to your goal. 📅
- **Complete Training Plan Management:** We’ve rolled out comprehensive tools for creating, activating, and managing full training plans, including the ability to easily **Share Your Plan** with friends or other coaches.
- **Plan Flexibility:** Need a fresh start? You can now easily abandon or clear scheduled workouts within your plan.

## 🤖 Smarter AI & Instant Workout Adjustments

Get more personalized guidance and greater control over your daily workouts.

- **AI-Powered Weekly Planning:** Use our new AI Planning Modal to generate a full week of training based on your goals and **custom instructions** (e.g., "I need a tough VO2 max session, but keep my long ride low-stress").
- **On-the-Fly Adjustments:** A planned workout too long, or too easy? You can now instantly adjust the **duration and intensity** of a planned workout directly in the app. 💪
- **Coach's Insights:** We've introduced a new **Workout Messages Timeline** that provides detailed, step-by-step coaching guidance and rationale _during_ your session.

## 🏊‍♀️ Multi-Sport Support & Deep Dive Data

Watts is officially broadening its horizons beyond cycling, giving multi-sport athletes comprehensive tracking and analysis.

- **Full Multi-Sport Integration:** Plan, track, and visualize training volume for **Cycling, Running, Swimming, and Strength Training.** Set volume hours for each activity.
- **Detailed Workout Visualization:** Planned workout pages now feature powerful new charts, including:
  - **Power Zone Distribution**
  - **Heart Rate Zone Tracking**
  - **Mini Workout Charts** right on the dashboard for quick visual reference.
- **Download & Export:** Ready to take your workout to your head unit or indoor trainer? You can now **download structured workouts** in popular **ZWO and .FIT formats!** 💾

## ✨ App Polish & Stability

We’ve improved the experience across the board with several key updates:

- **Default Dark Mode:** Watts now defaults to the sleek Dark Mode interface for an improved visual experience (especially helpful for late-night planning sessions). 🌙
- **Easy Account Control:** New dedicated screens and tools have been added for managing your account, including a streamlined **Account Deletion** process.
- **Reliability Fixes:** We've resolved several underlying issues related to training block regeneration and workout saving, ensuring your planning is smooth and reliable.

Update to v0.5.0 today and unlock a new level of coaching power! Happy training! 🚴‍♀️💨

# Major Update Alert! Coach Watts v0.5.0: Smarter Plans, Multi-Sport, and Workout Sharing! 🚀

We've been hard at work making Coach Watts the most powerful and flexible training partner, and this release is packed with features focused on dynamic, event-driven planning.

Here’s what’s new in v0.5.0:

---

## 📅 Precision Planning: Race Events & Periodization

Your training is no longer a static calendar. We've introduced advanced event management so your plan works backward from your most important goals:

- **Event-Driven Periodization:** You can now add key races, events, or trips to your schedule. Coach Watts will automatically structure your training blocks (base, build, peak) to ensure you hit peak fitness exactly when you need it. 🎯
- **Goal Wizard:** Easily set up and manage all your upcoming competitive and target events with dedicated new pages and tools.

## 🧠 Smarter AI Coaching & Customization

The AI planner is now highly flexible, giving you more control over your week-to-week schedule and specific workouts:

- **AI Week Planning with Instructions:** Have an unusual schedule or feeling fatigued? You can now chat directly with the planner, providing **custom instructions** (e.g., "Keep volume low due to a busy work week," or "Focus on sprint power this Sunday"). 🗣️
- **On-the-Fly Workout Adjustments:** Easily modify any planned workout's **duration or intensity** right in the app. If you need 15 minutes less, or a slightly easier session, the plan adapts instantly.
- **Personalized Coaching Messages:** Get helpful, personalized coaching tips, instructions, and motivational messages generated for your specific workouts before you start riding.

## 🏊‍♂️ Multi-Sport Support Has Arrived!

For all our triathletes, runners, and swimmers—or anyone who cross-trains—Coach Watts now fully supports managing multiple disciplines:

- **Activity Type Management:** Specify the sport (cycling, running, swimming, strength, etc.) for each workout and manage your volume across all activities.
- **Sport-Specific Views:** Workouts now render dynamic, sport-specific views, including heart rate zone tracking and stats for all activities, and pace/speed calculations for running and swimming.
- **Strength Training Focus:** Planned workouts can now include a target area field to help you focus your strength training efforts.

## 💾 Sharing & Downloads for Any Platform

Get your structured workouts out of Coach Watts and onto your favorite device or platform:

- **Workout Download:** Instantly download any structured workout in industry-standard **ZWO** (Zwift, TrainerRoad compatible) and **FIT** formats. 📤
- **Easy Sharing:** Share individual planned workouts or entire training plans via a simple public link. Perfect for showing off a great session or getting feedback from a third-party coach.
- **Visualization Tools:** New charts show your workout structure, including **power zone distribution** and power range ramps, so you know exactly what you're getting into.

## ✨ Improvements & Polish

- **Account Deletion:** Added a straightforward option to delete your user account and data if needed.
- **UI Consistency:** We've enforced a consistent dark mode theme for a smoother visual experience. 🌙
- **Better Plan Management:** Improved cleanup and removal of old workouts when you abandon or regenerate training blocks.

# 🚀 Coach Watts Release v0.3.1: Introducing Advanced Analytics and FIT File Uploads!

Hey team!

We are thrilled to announce our latest major update. This release is massive, delivering on our commitment to provide the deepest, most insightful analysis tools for cyclists and coaches.

Get ready to dive into performance metrics previously only available to elite teams. We've rolled out new integrations, enabled direct file uploads, and dramatically upgraded the intelligence of your AI Coach.

Here is what's new in this powerhouse release:

---

## 🔬 Next-Level Workout Analysis

We've fundamentally upgraded how Coach Watts analyzes your efforts, moving beyond basic metrics to provide actionable insights into your physiological performance during a ride.

- **Automatic Interval Detection:** We now automatically detect and analyze your hard efforts and recovery segments within any workout. View detailed stats for every interval right inside the app!
- **Deep Fatigue & Stability Metrics:** Understand exactly how your body responds to stress with new metrics like **Fatigue Sensitivity**, **Endurance Fade**, **Recovery Rate**, **Decoupling**, **Coasting**, and **Surge Detection**.
- **Power Curve & Performance Charts:** Instantly visualize your peak power outputs and track your fitness evolution over time with new interactive charts and dashboards.
- **Grade Analysis:** The workout timeline now includes stream data for elevation gain and gradient, giving you context on how terrain influenced your performance.
- **Smoother Workout Timeline:** We’ve enhanced the workout charts for better performance and synchronized hover functionality for crystal-clear data exploration.

## 🔗 Data Connectivity and Integrations

Bringing your data into Coach Watts has never been easier or more comprehensive.

- **Direct FIT File Uploads!** 🚴‍♂️ You can now upload your cycling computer's `.fit` files directly to Coach Watts from the Data page.
- **Withings Integration:** Seamlessly sync your weight, body composition, and wellness data from your Withings smart scale straight into your profile for holistic tracking.
- **Enhanced Intervals.icu Sync:** Our connection to Intervals.icu now supports syncing planned workouts and tracking your Training Stress Balance (TSB) more accurately.
- **Weight & Wellness Tracking:** Your user profile now tracks weight evolution and other key wellness metrics over time.

## 🤝 Sharing and Community

Want to show off a new personal best or share a complex training session with a friend or coach?

- **Public Workout Sharing:** You can now generate a unique, read-only link for any workout, allowing you to easily share detailed stats, charts, and analysis with anyone outside the app.

## ⚙️ Platform & User Experience Improvements

- **Improved Onboarding:** New users will find a smoother, more guided introduction to the app.
- **Developer API Access:** For the highly technical user or integrated coach, we’ve added API Key management and OpenAPI documentation to allow secure, custom integration with your Coach Watts data.
- **Goal and Profile Setup:** Easier management of your custom heart rate/power zones and new features for managing your training goals.
- **Pricing Update:** Coach Watts is now officially in **Free Early Access**!

## 🛠️ Key Fixes

We squashed some bugs to ensure your data is always reliable:

- **Heart Rate Zone Accuracy:** Fixed an issue that caused inaccuracies in calculating and displaying Heart Rate Zones.
- General stability improvements across our data ingestion and server architecture.

Happy Riding (and Analyzing)!

— The Coach Watts Team 💡

# Coach Watts v0.3.1 Release: Unleash Your Performance Potential! 🚀

We are thrilled to announce a massive update to Coach Watts! This release significantly deepens your workout analysis, introduces powerful new integrations, and makes sharing your achievements easier than ever.

Here’s what’s new and improved in the app:

---

## 🔬 Next-Level Workout Analysis

Your activity data is now more insightful than ever, thanks to new algorithms that dissect your performance beyond standard metrics.

- **Automatic Interval Detection:** We now automatically detect and analyze the specific intervals (laps, efforts) within your workouts. See detailed stats, pacing, and physiological response for every single hard effort!
- **Advanced Performance Metrics:** Unlock new insights with state-of-the-art metrics, including:
  - **Fatigue Sensitivity & Recovery Rate:** Understand how quickly you fatigue during efforts and how efficiently you recover afterward.
  - **Endurance Fade & Stability:** Get clear data on how well you maintain power output and form throughout long sessions.
  - **Coasting, Decoupling, and Surge Detection:** Pinpoint those moments of inefficiency or powerful bursts within your ride.
- **Enhanced Workout Timeline:** Our interactive workout chart is much smoother, visually displaying your effort gradient (grade/slope) alongside your power and heart rate data.
- **Accurate Heart Rate Zones:** We've corrected calculations to ensure your Heart Rate Zone distribution is perfectly accurate.

## 🔗 Seamless Data Integration

Getting your training and wellness data into Coach Watts is now simpler and more comprehensive.

- **Upload FIT Files Directly!** 📤 Have a raw file from your head unit? You can now manually upload `.fit` files directly to the app for immediate processing and analysis.
- **Withings Integration (Wellness Data):** Connect your Withings scale and devices to automatically track your weight and wellness metrics, giving the AI coach a complete picture of your health.
- **Improved Intervals.icu Sync:** Planned workouts from Intervals.icu now sync reliably, and we have implemented better initial syncing logic to ensure all your historical data is imported correctly.

## 📣 Public Workout Sharing

Show off your epic rides or help a friend analyze their efforts without logging in!

- **Shareable Read-Only Links:** Every completed workout can now generate a unique, public share link. Anyone with the link can view the workout details, timeline, and advanced metrics (read-only view).
- **Easy Sharing Button:** Find the new "Share" button on your workout detail page to generate the link instantly.

## 📈 Planning & Progress Tracking

We've added key tools for long-term tracking and planning.

- **Performance Management Curve (PMC):** Track your Fitness (CTL), Fatigue (ATL), and Form (TSB) directly on the Performance page to manage your training load effectively.
- **FTP and Weight Evolution:** See how your Functional Threshold Power (FTP) and body weight have changed over time with new evolution charts.
- **Goal Days on Calendar:** Your activity calendar now clearly highlights the dates you’ve set as "Goal Days," helping you keep the big picture in focus.

## 🛠️ Quality of Life & Developer Tools

- **Free Early Access!** Coach Watts is now available in Free Early Access.
- **New User Onboarding:** New athletes and coaches will now enjoy a guided introduction to the app's powerful features.
- **Developer Settings & API Access:** For advanced users or coaches managing external tools, we have introduced API Key management and OpenAPI documentation, allowing you to build custom integrations.

---

We believe these updates will transform how you interact with your training data. Log in now and dive into your new advanced metrics!

Happy cycling! 🚴
**— The Coach Watts Team**

## Massive Release: v0.3.1 is Here! 🚀 New Data, Deeper Analytics, and Public Sharing!

We've been busy under the hood, and we are thrilled to announce our largest feature release yet! This update fundamentally transforms how Coach Watts analyzes your training, handles your data, and connects with your favorite devices.

Here’s what’s new and improved in this exciting release:

---

### 1. Effortless Data Import & Integrations 🔌

We’ve made it easier than ever to get all your performance and wellness data into the app.

- **FIT File Upload:** Upload data directly from any cycling computer or watch! You can now manually upload standard `.FIT` files directly to the platform via a new upload page, with immediate processing and workout creation.
- **Withings Wellness Integration:** Connect your Withings smart scale! We now have full integration endpoints to automatically track your weight evolution and wellness metrics.
- **Enhanced Syncing:** We’ve improved the initial data synchronization for Intervals.icu to ensure a more reliable and complete transfer of your existing training history and planned workouts.
- **Data Page Upgrades:** Find a dedicated "Data Pipeline" section in your settings, making it clear where your data is coming from and the status of your syncs.

### 2. Next-Level Performance Analytics 🧠

This release brings truly advanced, granular analysis to every workout. Prepare for deep insights previously only available to elite athletes.

- **Advanced Workout Metrics Dashboard:** Every workout detail page now features a comprehensive dashboard displaying new metrics.
- **Interval Detection Algorithm:** Coach Watts now automatically detects and analyzes structured and unstructured intervals within your ride, giving you specific performance feedback on each effort block.
- **Cutting-Edge Training Metrics:** We calculate and display advanced metrics, including:
  - **Fatigue Sensitivity:** How much your power drops off during repeated efforts.
  - **Stability Metrics:** Analysis of how consistent you are in power and heart rate.
  - **Recovery Rate:** How quickly you bounce back between hard efforts.
  - **W’ Balance, Efficiency Factor, and Quadrant Analysis.**
- **New Workout Timeline View:** The workout visualization is now better than ever, including support for displaying the actual **Grade/Slope** of your ride alongside power and heart rate.
- **Corrected HR Zones:** We fixed an important bug to ensure your Heart Rate zone distribution and calculations are 100% accurate.

### 3. Share Your Achievements! 🥇

Want to show off that incredible FTP test or epic group ride? Now you can share your workouts instantly.

- **Public Workout Sharing:** Generate a unique, read-only public link for any completed workout. Share it with friends, family, or your social network—they don't need a Coach Watts account to view the full timeline, stats, and advanced analysis!

### 4. A Smarter AI Coach & Planning Tools 🗣️

The AI experience is faster, more informed, and comes with new features.

- **Advanced AI Toolset:** The AI Coach can now utilize new tools, including analyzing workout streams and performance metrics, allowing for much deeper, data-driven conversations about your training.
- **Structured Workout Analysis:** AI-generated analysis of your workouts now provides structured explanations, specific scores, and actionable recommendations.
- **Daily Training Recommendations:** Get personalized workout suggestions on your dashboard, driven by your recent load, recovery status, and goals.
- **Developer Settings:** For our technically minded users and partners, we've added a Developer Settings page for API Key management and documentation access.

### 5. Platform Updates & Quality of Life ✨

- **Free Early Access:** We've updated our pricing structure to reflect that Coach Watts is currently in **Free Early Access**. Enjoy all these powerful features at no cost!
- **New User Onboarding:** New users will find a much smoother, guided experience getting started with Coach Watts.
- **Enhanced Calendars:** The Activities Calendar now clearly highlights your **Goal Days** and integrates wellness indicators.
- **Improved Navigation:** We’ve refined the app layout and navigation for faster access to your Goals, Performance dashboards, and Coaching chat rooms.

We hope you enjoy this massive update! Happy training!

— The Coach Watts Team 🚴‍♀️
