namespace MPR121 {
    // ====== I2C / レジスタ定義 ======
    let I2C_ADDR = 0x5B
    const REG_TOUCH_STATUS_L = 0x00
    const REG_TOUCH_STATUS_H = 0x01
    const REG_ECR = 0x5E

    // Per-electrode threshold registers
    // ELE0: Touch=0x41, Release=0x42, 以後 2ずつ進む
    function REG_TTH(key: number) { return 0x41 + key * 2 } // touch threshold
    function REG_RTH(key: number) { return 0x42 + key * 2 } // release threshold

    // ====== イベント定義 ======
    const EVT_SRC = 0xA121
    const EVT_PRESSED = 1
    const EVT_RELEASED = 2
    const EVT_ANY_PRESSED = 3
    const EVT_ANY_RELEASED = 4

    // ====== 状態 ======
    let _started = false
    let _prevMask = 0
    let _pollMs = 20 // デフォルト 20ms
    let _running = false // ECRの有効状態を記録

    // ====== enum ======
    export enum Key {
        //% block="T0"
        T0 = 0, // … T0〜T11
        //% block="T1"
        T1,
        //% block="T2"
        T2,
        //% block="T3"
        T3,
        //% block="T4"
        T4,
        //% block="T5"
        T5,
        //% block="T6"
        T6,
        //% block="T7"
        T7,
        //% block="T8"
        T8,
        //% block="T9"
        T9,
        //% block="T10"
        T10,
        //% block="T11"
        T11
    }

    export enum I2CAddress {
        //% block="0x5A (default)"
        Addr_0x5A = 0x5A,
        //% block="0x5B"
        Addr_0x5B = 0x5B,
        //% block="0x5C"
        Addr_0x5C = 0x5C,
        //% block="0x5D"
        Addr_0x5D = 0x5D
    }

    // ====== 低レベル I2C ======
    function writeReg(reg: number, val: number) {
        const buf = pins.createBuffer(2)
        buf.setNumber(NumberFormat.UInt8LE, 0, reg)
        buf.setNumber(NumberFormat.UInt8LE, 1, val & 0xFF)
        pins.i2cWriteBuffer(I2C_ADDR, buf, false)
    }

    function readRegU8(reg: number): number {
        pins.i2cWriteNumber(I2C_ADDR, reg, NumberFormat.UInt8BE, true)
        return pins.i2cReadNumber(I2C_ADDR, NumberFormat.UInt8BE, false) & 0xFF
    }

    function readTouchMask(): number {
        const l = readRegU8(REG_TOUCH_STATUS_L)
        const h = readRegU8(REG_TOUCH_STATUS_H)
        return ((h << 8) | l) & 0x0FFF // 12bit
    }

    // ====== ECR（有効/停止）制御 ======
    function stopRun() {
        if (_running) {
            writeReg(REG_ECR, 0x00) // 停止
            basic.pause(5)
            _running = false
        }
    }

    function startRun() {
        if (!_running) {
            // CL=0, ELEPROX=0, ELE=0x0F(=12ch) → 0x8F
            writeReg(REG_ECR, 0x8F)
            basic.pause(5)
            _running = true
        }
    }

    // 安全適用：一時停止→処理→再開
    function applySafely(fn: () => void) {
        stopRun()
        fn()
        startRun()
    }

    // ====== 内部：ポーリング開始 ======
    function startIfNeeded() {
        if (_started) return
        _started = true

        // 一旦停止→起動（初期化）
        stopRun()
        startRun()

        control.inBackground(function () {
            while (true) {
                const mask = readTouchMask()
                const diff = mask ^ _prevMask
                if (diff) {
                    for (let k = 0; k < 12; k++) {
                        const bit = 1 << k
                        if (diff & bit) {
                            const pressed = (mask & bit) !== 0
                            if (pressed) {
                                control.raiseEvent(EVT_SRC, (k << 4) | EVT_PRESSED)
                                control.raiseEvent(EVT_SRC, EVT_ANY_PRESSED)
                            } else {
                                control.raiseEvent(EVT_SRC, (k << 4) | EVT_RELEASED)
                                control.raiseEvent(EVT_SRC, EVT_ANY_RELEASED)
                            }
                        }
                    }
                    _prevMask = mask
                }
                basic.pause(_pollMs)
            }
        })
    }

    // ====== 公開ブロック ======

    /**
     * MPR121 の I2C アドレスを設定します（既定 0x5A）。
     */
    //% blockId=mpr121_set_addr block="MPR121 の I2C アドレスを %addr に設定する"
    //% weight=95
    export function setAddress(addr: I2CAddress) {
        I2C_ADDR = addr as number
    }

    /**
     * ポーリング周期（ミリ秒）を設定します（デフォルト 20ms）。
     */
    //% blockId=mpr121_set_poll block="MPR121 のポーリング周期を %ms ミリ秒にする"
    //% ms.min=5 ms.max=200 ms.defl=20
    //% weight=94
    export function setPollingInterval(ms: number) {
        _pollMs = Math.max(5, Math.min(200, ms | 0))
    }

    /**
     * 任意のタイミングで12ビットのタッチ状態を取得します（1=タッチ）。
     */
    //% blockId=mpr121_read_mask block="MPR121 のタッチ状態(12bit)を読む"
    //% weight=80
    export function readTouchStatus(): number {
        startIfNeeded()
        return readTouchMask()
    }

    /**
     * 特定キーが押されているか（連続監視にも利用可）
     */
    //% blockId=mpr121_is_touched block="MPR121 でキー %key がタッチ中か"
    //% weight=79
    export function isTouched(key: Key): boolean {
        startIfNeeded()
        return (readTouchMask() & (1 << key)) !== 0
    }

    /**
     * 指定キーが「押された」時に実行（立ち上がりエッジ）
     */
    //% blockId=mpr121_on_pressed block="MPR121 でキー %key が押されたとき"
    //% weight=70
    export function onPressed(key: Key, handler: () => void) {
        startIfNeeded()
        const value = ((key as number) << 4) | EVT_PRESSED
        control.onEvent(EVT_SRC, value, handler)
    }

    /**
     * 指定キーが「離された」時に実行（立ち下がりエッジ）
     */
    //% blockId=mpr121_on_released block="MPR121 でキー %key が離されたとき"
    //% weight=69
    export function onReleased(key: Key, handler: () => void) {
        startIfNeeded()
        const value2 = ((key as number) << 4) | EVT_RELEASED
        control.onEvent(EVT_SRC, value2, handler)
    }

    /**
     * いずれかのキーが押された時に実行
     */
    //% blockId=mpr121_on_any_pressed block="MPR121 でどれかのキーが押されたとき"
    //% weight=60
    export function onAnyPressed(handler: () => void) {
        startIfNeeded()
        control.onEvent(EVT_SRC, EVT_ANY_PRESSED, handler)
    }

    /**
     * いずれかのキーが離された時に実行
     */
    //% blockId=mpr121_on_any_released block="MPR121 でどれかのキーが離されたとき"
    //% weight=59
    export function onAnyReleased(handler: () => void) {
        startIfNeeded()
        control.onEvent(EVT_SRC, EVT_ANY_RELEASED, handler)
    }

    // ====== ★ 追加：閾値設定ブロック ======

    /**
     * 指定キーのタッチ/リリース閾値を設定します（0〜255）。
     * 一般に touch > release（触れた時の方を大きく）にします。
     */
    //% blockId=mpr121_set_threshold block="MPR121 でキー %key の閾値を | touch %touch | release %release に設定"
    //% touch.min=0 touch.max=255 touch.defl=12
    //% release.min=0 release.max=255 release.defl=6
    //% weight=88
    export function setThreshold(key: Key, touch: number, release: number) {
        const m = key as number
        const t = Math.max(0, Math.min(255, touch | 0))
        const r = Math.max(0, Math.min(255, release | 0))
        applySafely(() => {
            writeReg(REG_TTH(m), t)
            writeReg(REG_RTH(m), r)
        })
    }

    /**
     * 全キー（T0〜T11）のタッチ/リリース閾値を一括設定します（0〜255）。
     */
    //% blockId=mpr121_set_all_thresholds block="MPR121 ですべてのキーの閾値を | touch %touch | release %release に一括設定"
    //% touch.min=0 touch.max=255 touch.defl=12
    //% release.min=0 release.max=255 release.defl=6
    //% weight=87
    export function setAllThresholds(touch: number, release: number) {
        const u = Math.max(0, Math.min(255, touch | 0))
        const s = Math.max(0, Math.min(255, release | 0))
        applySafely(() => {
            for (let n = 0; n < 12; n++) {
                writeReg(REG_TTH(n), u)
                writeReg(REG_RTH(n), s)
            }
        })
    }
}
