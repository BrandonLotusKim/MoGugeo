// Windows 작업 스케줄러 등록용 XML 생성 (electron 의존 없음 — 단위 테스트 대상)

const TIME_PATTERN = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function escapeXml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function pad2(value: number): string {
  return String(value).padStart(2, "0");
}

/**
 * 매일 time(HH:MM)에 `executable --popup` 을 실행하는 작업 정의.
 * StartWhenAvailable: PC 가 꺼져 있어 예정 시각을 놓치면 다음 로그온/부팅 때 바로 실행한다.
 */
export function buildDailyPopupTaskXml(executable: string, time: string, today: Date = new Date()): string {
  if (!TIME_PATTERN.test(time)) {
    throw new Error(`Invalid time: ${time}`);
  }
  if (!executable) {
    throw new Error("Executable path is required");
  }

  const date = `${today.getFullYear()}-${pad2(today.getMonth() + 1)}-${pad2(today.getDate())}`;
  const startBoundary = `${date}T${time}:00`;

  return [
    '<?xml version="1.0" encoding="UTF-16"?>',
    '<Task version="1.2" xmlns="http://schemas.microsoft.com/windows/2004/02/mit/task">',
    "  <RegistrationInfo>",
    "    <Description>모국어 데일리 팝업</Description>",
    "  </RegistrationInfo>",
    "  <Triggers>",
    "    <CalendarTrigger>",
    `      <StartBoundary>${startBoundary}</StartBoundary>`,
    "      <Enabled>true</Enabled>",
    "      <ScheduleByDay>",
    "        <DaysInterval>1</DaysInterval>",
    "      </ScheduleByDay>",
    "    </CalendarTrigger>",
    "  </Triggers>",
    "  <Principals>",
    '    <Principal id="Author">',
    "      <LogonType>InteractiveToken</LogonType>",
    "      <RunLevel>LeastPrivilege</RunLevel>",
    "    </Principal>",
    "  </Principals>",
    "  <Settings>",
    "    <MultipleInstancesPolicy>IgnoreNew</MultipleInstancesPolicy>",
    "    <DisallowStartIfOnBatteries>false</DisallowStartIfOnBatteries>",
    "    <StopIfGoingOnBatteries>false</StopIfGoingOnBatteries>",
    "    <StartWhenAvailable>true</StartWhenAvailable>",
    "    <ExecutionTimeLimit>PT0S</ExecutionTimeLimit>",
    "    <Enabled>true</Enabled>",
    "  </Settings>",
    '  <Actions Context="Author">',
    "    <Exec>",
    `      <Command>${escapeXml(executable)}</Command>`,
    "      <Arguments>--popup</Arguments>",
    "    </Exec>",
    "  </Actions>",
    "</Task>",
    "",
  ].join("\r\n");
}

/** `schtasks /query /xml` 출력에서 HH:MM 추출 */
export function parseTaskTime(xml: string): string | null {
  const match = xml.match(/<StartBoundary>[^<]*T(\d{2}:\d{2}):\d{2}[^<]*<\/StartBoundary>/);
  return match?.[1] ?? null;
}
