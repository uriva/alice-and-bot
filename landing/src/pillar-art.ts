import { html, type TemplateResult } from "lit";

const frameClass =
  "w-full h-[88px] rounded-xl bg-[#faf9f5] dark:bg-[#1a1916] border border-[#ece8df] dark:border-[#262521] mb-4 flex items-center justify-center overflow-hidden px-3";

const crossHarnessArt = (): TemplateResult =>
  html`
    <div class="${frameClass}" aria-hidden="true">
      <svg viewBox="0 0 280 80" class="w-full h-full max-w-[260px]" fill="none">
        <path
          d="M72 19 C104 19, 108 40, 128 40"
          class="stroke-[#cbc6b9] dark:stroke-[#3a3832]"
          stroke-width="1.5"
          stroke-dasharray="3 3"
        />
        <path
          d="M72 40 L128 40"
          class="stroke-[#cbc6b9] dark:stroke-[#3a3832]"
          stroke-width="1.5"
          stroke-dasharray="3 3"
        />
        <path
          d="M72 61 C104 61, 108 40, 128 40"
          class="stroke-[#cbc6b9] dark:stroke-[#3a3832]"
          stroke-width="1.5"
          stroke-dasharray="3 3"
        />
        <path
          d="M174 40 L214 40"
          class="stroke-[#39587f] dark:stroke-[#7da2cf]"
          stroke-width="1.5"
        />
        <rect
          x="10"
          y="9"
          width="62"
          height="20"
          rx="10"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.2"
        />
        <circle cx="22" cy="19" r="3.5" fill="#39587f" />
        <text
          x="30"
          y="22.5"
          class="fill-[#4a4740] dark:fill-[#c4bfb5]"
          font-size="9"
          font-family="monospace"
          font-weight="600"
        >
          MCP
        </text>

        <rect
          x="10"
          y="30"
          width="62"
          height="20"
          rx="10"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.2"
        />
        <circle cx="22" cy="40" r="3.5" fill="#b06d3b" />
        <text
          x="30"
          y="43.5"
          class="fill-[#4a4740] dark:fill-[#c4bfb5]"
          font-size="9"
          font-family="monospace"
          font-weight="600"
        >
          VPS
        </text>

        <rect
          x="10"
          y="51"
          width="62"
          height="20"
          rx="10"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.2"
        />
        <circle cx="22" cy="61" r="3.5" fill="#6b568c" />
        <text
          x="30"
          y="64.5"
          class="fill-[#4a4740] dark:fill-[#c4bfb5]"
          font-size="9"
          font-family="monospace"
          font-weight="600"
        >
          Worker
        </text>

        <rect
          x="128"
          y="23"
          width="48"
          height="34"
          rx="11"
          class="fill-[#39587f] dark:fill-[#2f445f]"
        />
        <circle cx="143" cy="40" r="3" fill="#ffffff" opacity="0.9" />
        <circle cx="152" cy="40" r="3" fill="#ffffff" opacity="0.9" />
        <circle cx="161" cy="40" r="3" fill="#ffffff" opacity="0.9" />

        <rect
          x="214"
          y="25"
          width="54"
          height="30"
          rx="15"
          class="fill-white dark:fill-[#151513] stroke-[#39587f]/50 dark:stroke-[#7da2cf]/60"
          stroke-width="1.3"
        />
        <circle cx="229" cy="40" r="4" fill="#3f7a8c" />
        <text
          x="237"
          y="43.5"
          class="fill-[#181715] dark:fill-[#f3f1ea]"
          font-size="9.5"
          font-family="sans-serif"
          font-weight="700"
        >
          You
        </text>
      </svg>
    </div>
  `;

const e2eEncryptedArt = (): TemplateResult =>
  html`
    <div class="${frameClass}" aria-hidden="true">
      <svg viewBox="0 0 280 80" class="w-full h-full max-w-[260px]" fill="none">
        <line
          x1="64"
          y1="40"
          x2="96"
          y2="40"
          class="stroke-[#cbc6b9] dark:stroke-[#3a3832]"
          stroke-width="1.5"
          stroke-dasharray="3 3"
        />
        <line
          x1="184"
          y1="40"
          x2="216"
          y2="40"
          class="stroke-[#cbc6b9] dark:stroke-[#3a3832]"
          stroke-width="1.5"
          stroke-dasharray="3 3"
        />

        <rect
          x="12"
          y="24"
          width="52"
          height="32"
          rx="10"
          class="fill-[#39587f] dark:fill-[#2f445f]"
        />
        <text
          x="38"
          y="43.5"
          text-anchor="middle"
          fill="#ffffff"
          font-size="10.5"
          font-family="sans-serif"
          font-weight="600"
        >
          Hi!
        </text>

        <rect
          x="96"
          y="16"
          width="88"
          height="48"
          rx="12"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.3"
        />
        <path
          d="M135 31 v-3 a5 5 0 0 1 10 0 v3"
          class="stroke-[#39587f] dark:stroke-[#7da2cf]"
          stroke-width="1.6"
          stroke-linecap="round"
        />
        <rect
          x="132"
          y="31"
          width="16"
          height="12"
          rx="3"
          class="fill-[#39587f] dark:fill-[#6b93c4]"
        />
        <text
          x="140"
          y="55"
          text-anchor="middle"
          class="fill-[#8c867c]"
          font-size="8.5"
          font-family="monospace"
        >
          9f#a2…7c
        </text>

        <rect
          x="216"
          y="24"
          width="52"
          height="32"
          rx="10"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.3"
        />
        <text
          x="242"
          y="43.5"
          text-anchor="middle"
          class="fill-[#181715] dark:fill-[#f3f1ea]"
          font-size="10.5"
          font-family="sans-serif"
          font-weight="600"
        >
          Hi!
        </text>
      </svg>
    </div>
  `;

const freeIdentityArt = (): TemplateResult =>
  html`
    <div class="${frameClass}" aria-hidden="true">
      <svg viewBox="0 0 280 80" class="w-full h-full max-w-[260px]" fill="none">
        <rect
          x="18"
          y="16"
          width="164"
          height="48"
          rx="12"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.3"
        />
        <circle cx="42" cy="40" r="13" fill="#b06d3b" opacity="0.16" />
        <circle cx="39" cy="40" r="4.5" stroke="#b06d3b" stroke-width="1.8" />
        <path
          d="M43.5 40 H52 M49 40 V43.5 M52 40 V43"
          stroke="#b06d3b"
          stroke-width="1.8"
          stroke-linecap="round"
        />
        <text
          x="64"
          y="36"
          class="fill-[#181715] dark:fill-[#f3f1ea]"
          font-size="11"
          font-family="monospace"
          font-weight="700"
        >
          @my_agent
        </text>
        <text
          x="64"
          y="51"
          class="fill-[#8c867c]"
          font-size="8.5"
          font-family="monospace"
        >
          key: 0x8f2a…d91e
        </text>

        <rect
          x="196"
          y="22"
          width="66"
          height="36"
          rx="18"
          class="fill-[#efede6] dark:fill-[#22211d] stroke-[#dedad0] dark:stroke-[#32302b]"
          stroke-width="1.2"
        />
        <text
          x="229"
          y="38"
          text-anchor="middle"
          class="fill-[#181715] dark:fill-[#f3f1ea]"
          font-size="11"
          font-family="monospace"
          font-weight="700"
        >
          $0
        </text>
        <text
          x="229"
          y="50"
          text-anchor="middle"
          class="fill-[#78736a] dark:fill-[#9c968c]"
          font-size="8"
          font-family="sans-serif"
        >
          no SIM
        </text>
      </svg>
    </div>
  `;

const openSourceArt = (): TemplateResult =>
  html`
    <div class="${frameClass}" aria-hidden="true">
      <svg viewBox="0 0 280 80" class="w-full h-full max-w-[260px]" fill="none">
        <rect
          x="16"
          y="20"
          width="68"
          height="40"
          rx="11"
          class="fill-[#181715] dark:fill-[#f3f1ea]"
        />
        <text
          x="50"
          y="39"
          text-anchor="middle"
          class="fill-[#faf9f5] dark:fill-[#181715]"
          font-size="11"
          font-family="monospace"
          font-weight="700"
        >
          &lt;/&gt;
        </text>
        <text
          x="50"
          y="52"
          text-anchor="middle"
          class="fill-[#cbc6b9] dark:fill-[#57534e]"
          font-size="8.5"
          font-family="monospace"
          font-weight="600"
        >
          MIT
        </text>

        <path
          d="M84 40 H110 M110 21 V59 M110 21 H126 M110 59 H126"
          class="stroke-[#cbc6b9] dark:stroke-[#3a3832]"
          stroke-width="1.5"
          stroke-linecap="round"
        />

        <rect
          x="126"
          y="11"
          width="62"
          height="22"
          rx="8"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.2"
        />
        <text
          x="157"
          y="25.5"
          text-anchor="middle"
          class="fill-[#4a4740] dark:fill-[#c4bfb5]"
          font-size="9"
          font-family="monospace"
          font-weight="600"
        >
          SDK
        </text>

        <rect
          x="196"
          y="11"
          width="66"
          height="22"
          rx="8"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.2"
        />
        <text
          x="229"
          y="25.5"
          text-anchor="middle"
          class="fill-[#4a4740] dark:fill-[#c4bfb5]"
          font-size="9"
          font-family="monospace"
          font-weight="600"
        >
          Worker
        </text>

        <rect
          x="126"
          y="47"
          width="62"
          height="22"
          rx="8"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.2"
        />
        <text
          x="157"
          y="61.5"
          text-anchor="middle"
          class="fill-[#4a4740] dark:fill-[#c4bfb5]"
          font-size="9"
          font-family="monospace"
          font-weight="600"
        >
          App
        </text>

        <rect
          x="196"
          y="47"
          width="66"
          height="22"
          rx="8"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.2"
        />
        <text
          x="229"
          y="61.5"
          text-anchor="middle"
          class="fill-[#4a4740] dark:fill-[#c4bfb5]"
          font-size="9"
          font-family="monospace"
          font-weight="600"
        >
          MCP
        </text>
      </svg>
    </div>
  `;

const desktopMobileArt = (): TemplateResult =>
  html`
    <div class="${frameClass}" aria-hidden="true">
      <svg viewBox="0 0 280 80" class="w-full h-full max-w-[260px]" fill="none">
        <rect
          x="26"
          y="10"
          width="150"
          height="60"
          rx="10"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.3"
        />
        <line
          x1="26"
          y1="23"
          x2="176"
          y2="23"
          class="stroke-[#ece8df] dark:stroke-[#262521]"
          stroke-width="1.2"
        />
        <circle cx="36" cy="16.5" r="2"
          class="fill-[#d6d2c7] dark:fill-[#3a3832]" />
        <circle cx="43" cy="16.5" r="2"
          class="fill-[#d6d2c7] dark:fill-[#3a3832]" />
        <circle cx="50" cy="16.5" r="2"
          class="fill-[#d6d2c7] dark:fill-[#3a3832]" />
        <line
          x1="66"
          y1="23"
          x2="66"
          y2="70"
          class="stroke-[#ece8df] dark:stroke-[#262521]"
          stroke-width="1.2"
        />
        <rect
          x="33"
          y="30"
          width="26"
          height="6"
          rx="3"
          class="fill-[#ebe7dc] dark:fill-[#262521]"
        />
        <rect
          x="33"
          y="41"
          width="22"
          height="6"
          rx="3"
          class="fill-[#f2efe8] dark:fill-[#1f1e1b]"
        />
        <rect x="110" y="30" width="56" height="11" rx="5.5" fill="#39587f" />
        <rect
          x="76"
          y="47"
          width="66"
          height="12"
          rx="6"
          class="fill-[#f2efe8] dark:fill-[#22211d]"
        />

        <rect
          x="196"
          y="12"
          width="46"
          height="58"
          rx="10"
          class="fill-white dark:fill-[#151513] stroke-[#181715]/30 dark:stroke-[#f3f1ea]/30"
          stroke-width="1.5"
        />
        <rect
          x="212"
          y="17"
          width="14"
          height="2.5"
          rx="1.25"
          class="fill-[#d6d2c7] dark:fill-[#3a3832]"
        />
        <rect x="214" y="26" width="22" height="9" rx="4.5" fill="#39587f" />
        <rect
          x="202"
          y="39"
          width="28"
          height="9"
          rx="4.5"
          class="fill-[#f2efe8] dark:fill-[#22211d]"
        />
        <rect
          x="202"
          y="53"
          width="34"
          height="9"
          rx="4.5"
          class="fill-[#faf9f5] dark:fill-[#1c1b18] stroke-[#e5e1d6] dark:stroke-[#2b2a26]"
          stroke-width="1"
        />
        <circle cx="240" cy="14" r="5" fill="#b06d3b" />
      </svg>
    </div>
  `;

const embedAnywhereArt = (): TemplateResult =>
  html`
    <div class="${frameClass}" aria-hidden="true">
      <svg viewBox="0 0 280 80" class="w-full h-full max-w-[260px]" fill="none">
        <rect
          x="12"
          y="10"
          width="116"
          height="60"
          rx="10"
          fill="#11131a"
          stroke="#2a2e3d"
          stroke-width="1.2"
        />
        <rect x="64" y="19" width="52" height="10" rx="5" fill="#252836" />
        <rect x="24" y="34" width="66" height="5" rx="2.5" fill="#52525b" />
        <rect x="24" y="42" width="48" height="5" rx="2.5" fill="#3f3f46" />
        <rect
          x="22"
          y="53"
          width="96"
          height="10"
          rx="5"
          fill="#181b25"
          stroke="#2a2e3d"
          stroke-width="1"
        />
        <circle cx="111" cy="58" r="3.2" fill="#39587f" />

        <rect
          x="152"
          y="10"
          width="116"
          height="60"
          rx="10"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#302e29]"
          stroke-width="1.2"
        />
        <rect
          x="162"
          y="20"
          width="36"
          height="5"
          rx="2.5"
          class="fill-[#d6d2c7] dark:fill-[#32302b]"
        />
        <rect
          x="162"
          y="29"
          width="48"
          height="4"
          rx="2"
          class="fill-[#ece8df] dark:fill-[#24231f]"
        />
        <rect
          x="162"
          y="36"
          width="40"
          height="4"
          rx="2"
          class="fill-[#ece8df] dark:fill-[#24231f]"
        />

        <rect
          x="208"
          y="28"
          width="52"
          height="36"
          rx="7"
          class="fill-[#faf9f5] dark:fill-[#1b1a17] stroke-[#39587f]/50 dark:stroke-[#7da2cf]/60"
          stroke-width="1.2"
        />
        <rect
          x="208"
          y="28"
          width="52"
          height="10"
          rx="5"
          class="fill-[#181715] dark:fill-[#292824]"
        />
        <rect
          x="214"
          y="43"
          width="36"
          height="7"
          rx="3.5"
          class="fill-[#ebe7dc] dark:fill-[#262521]"
        />
        <rect
          x="214"
          y="53"
          width="40"
          height="6"
          rx="3"
          class="fill-white dark:fill-[#151513] stroke-[#dedad0] dark:stroke-[#2f2e29]"
          stroke-width="0.9"
        />
      </svg>
    </div>
  `;

export type PillarArtKey =
  | "cross-harness"
  | "e2e"
  | "free-identities"
  | "open-source"
  | "desktop-mobile"
  | "embed";

const artByKey: Record<PillarArtKey, () => TemplateResult> = {
  "cross-harness": crossHarnessArt,
  "e2e": e2eEncryptedArt,
  "free-identities": freeIdentityArt,
  "open-source": openSourceArt,
  "desktop-mobile": desktopMobileArt,
  "embed": embedAnywhereArt,
};

export const renderPillarArt = (key: PillarArtKey): TemplateResult =>
  artByKey[key]();
