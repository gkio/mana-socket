
    const eventReg = /EX=(.*?)\~/gm
    const marketReg = /EX=.*?\~(.*?)\;/gm;
    const moneyBetReg = /ST=(.*?)\;/gm;
    const betTypeReg = /VA=.*?;NA=(.*?)\;RE/gm
    const selectReg = /OR=.*?NA=(.*?)\;OD=/gm
    const idReg = /BE\;ID=(.*?)\;/gm

    const getOD = /OD=(.*?)\;EX=/gm
    const getFD = /FD=(.*?)\;BC=/gm
    const getI2 = /I2=(.*?)\;PE=/gm
    const getST = /ST=(.*?)\;VA=/gm
    const getRE = /RE=(.*?)\;CR=/gm
    const getSA = /SA=(.*?)\;SU=/gm

    const getValue = (reg, str, multiple = true) => {
      let m;
      var data = [];
      return new Promise((resolve, reject) => {
        while ((m = reg.exec(str)) !== null) {
          // This is necessary to avoid infinite loops with zero-width matches
          if (m.index === reg.lastIndex) {
            reg.lastIndex++;
          }
          m.forEach((match, groupIndex) => {
            if (groupIndex === 1) {
              if (multiple) {
                data.push(match)
              } else {
                resolve(match)
              }
            }
          });
          if (multiple) {
            resolve(data)
          }
        }
        resolve(multiple ? [] : null)
      })
    }

const args = async (payload) => {
    let str = "";
    const _OD = await getValue(getOD, payload);
    const _FD = await getValue(getFD, payload);
    const _I2 = await getValue(getI2, payload);
    _OD.forEach((od, key) => {
        const OD = _OD[key];
        const FD = _FD[key];
        const I2 = _I2[key];
        str += `pt=N#o=${OD}#f=${FD}#fp=${I2}#so=#c=1#sa=****#mt=1|TP=BS${FD}-${I2}#||`
    })
    return str
  }

  module.exports = args;