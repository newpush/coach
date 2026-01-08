<template>
  <div class="bg-white dark:bg-gray-900 py-24 sm:py-32">
    <div class="mx-auto max-w-3xl px-6 lg:px-8">
      <div class="mx-auto max-w-2xl text-center">
        <h2 class="text-base font-semibold leading-7 text-primary-600 dark:text-primary-400">
          Legal
        </h2>
        <p class="mt-2 text-3xl font-bold tracking-tight text-gray-900 dark:text-white sm:text-4xl">
          Cookie Policy
        </p>
        <p class="mt-4 text-lg leading-8 text-gray-600 dark:text-gray-300">
          Effective Date: January 8, 2026
        </p>
      </div>

      <div class="mt-16 space-y-8 text-base leading-7 text-gray-600 dark:text-gray-300">
        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            1. What Are Cookies?
          </h3>
          <p>
            Cookies are small text files that are placed on your computer or mobile device when you
            visit a website. They are widely used by website owners to make their websites work, or
            work more efficiently, as well as to provide reporting information. Cookies set by the
            website owner (in this case, <strong>TheNewPush, LLC.</strong>) are called "first-party
            cookies." Cookies set by parties other than the website owner are called "third-party
            cookies."
          </p>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            2. Why We Use Cookies
          </h3>
          <p>
            We use cookies for several reasons. Some cookies are required for technical reasons in
            order for our Service to operate, and we refer to these as "essential" or "strictly
            necessary" cookies. Other cookies also enable us to track and target the interests of
            our users to enhance the experience on our Service. Third parties serve cookies through
            our Service for advertising, analytics, and other purposes.
          </p>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            3. Types of Cookies We Use
          </h3>
          <ul class="list-disc pl-5 space-y-4 mt-2">
            <li>
              <strong>Essential Cookies:</strong> These cookies are strictly necessary to provide
              you with services available through our website and to use some of its features, such
              as access to secure areas (e.g., authentication tokens for logging in).
            </li>
            <li>
              <strong>Performance & Analytics Cookies:</strong> These cookies collect information
              that is used either in aggregate form to help us understand how our website is being
              used or how effective our marketing campaigns are, or to help us customize our website
              for you.
            </li>
            <li>
              <strong>Functional Cookies:</strong> These cookies allow our website to remember
              choices you make (such as your user name, language, or the region you are in) and
              provide enhanced, more personal features.
            </li>
            <li>
              <strong>Targeting Cookies:</strong> These cookies are used to make advertising
              messages more relevant to you. They perform functions like preventing the same ad from
              continuously reappearing, ensuring that ads are properly displayed for advertisers,
              and in some cases selecting advertisements that are based on your interests.
            </li>
          </ul>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            4. User Consent
          </h3>
          <p>
            When you first visit our website, we may present you with a cookie banner that allows
            you to accept or decline non-essential cookies. By clicking "Accept" or continuing to
            use our Service after the banner has appeared, you consent to the placement of cookies
            on your device as described in this policy. You can withdraw your consent at any time by
            deleting your cookies or changing your browser settings.
          </p>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            5. Managing Cookies
          </h3>
          <p>
            You have the right to decide whether to accept or reject cookies. You can exercise your
            cookie preferences by setting or amending your web browser controls to accept or refuse
            cookies. If you choose to reject cookies, you may still use our website though your
            access to some functionality and areas of our website may be restricted. As the means by
            which you can refuse cookies through your web browser controls vary from
            browser-to-browser, you should visit your browser's help menu for more information.
          </p>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            6. Changes to This Cookie Policy
          </h3>
          <p>
            We may update this Cookie Policy from time to time in order to reflect, for example,
            changes to the cookies we use or for other operational, legal, or regulatory reasons.
            Please therefore re-visit this Cookie Policy regularly to stay informed about our use of
            cookies and related technologies.
          </p>
        </div>

        <div>
          <h3 class="text-2xl font-bold tracking-tight text-gray-900 dark:text-white mb-4">
            7. Contact Us
          </h3>
          <p>
            If you have any questions about our use of cookies or other technologies, please contact
            us at:
          </p>
          <div class="mt-4 p-4 bg-gray-50 dark:bg-gray-800 rounded-lg">
            <p><strong>TheNewPush, LLC.</strong></p>
            <p>
              Email:
              <a
                href="mailto:support@newpush.com"
                class="text-primary-600 dark:text-primary-400 hover:underline"
                >support@newpush.com</a
              >
            </p>
          </div>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup lang="ts">
  definePageMeta({
    layout: 'home',
    auth: false
  })

  useHead({
    title: 'Cookie Policy',
    meta: [
      {
        name: 'description',
        content:
          'Coach Watts Cookie Policy. Learn about how TheNewPush, LLC. uses cookies to improve your experience and how you can manage them.'
      }
    ]
  })
</script>
