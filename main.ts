namespace MPR121 {
    const MPR121_ADDR = 0x5A

    // タッチ状態を返す（12ビットのbitmask）
    //% block="read touch status"
    export function readTouch(): number {
        pins.i2cWriteNumber(MPR121_ADDR, 0x00, NumberFormat.UInt8BE)
        let LSB = pins.i2cReadNumber(MPR121_ADDR, NumberFormat.UInt8BE)
        pins.i2cWriteNumber(MPR121_ADDR, 0x01, NumberFormat.UInt8BE)
        let MSB = pins.i2cReadNumber(MPR121_ADDR, NumberFormat.UInt8BE)
        return (MSB << 8) | LSB
    }

    // 特定のキーが押されたかどうか
    //% block="is key %key touched"
    export function isTouched(key: number): boolean {
        let touched = readTouch()
        return (touched & (1 << key)) != 0
    }
}
