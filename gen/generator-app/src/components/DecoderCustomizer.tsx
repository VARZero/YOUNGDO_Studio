import React, { useState } from 'react';
import {
  type DecoderParamConfig,
  type InstructionFormat,
  type InstructionConfig,
  type FormatField,
  type ImmediatePart,
  type FieldRole,
} from '../utils/decoderGenerator';
import { type CoreTypeConfig } from '../utils/rtlGenerator';
import { type Language, tr } from '../utils/locale';

interface DecoderCustomizerProps {
  language: Language;
  decConfig: DecoderParamConfig;
  onChangeDecConfig: (c: DecoderParamConfig) => void;
  formats: InstructionFormat[];
  onChangeFormats: (f: InstructionFormat[]) => void;
  instructions: InstructionConfig[];
  onChangeInstructions: (i: InstructionConfig[]) => void;
  coresList: CoreTypeConfig[];
}

export const DecoderCustomizer: React.FC<DecoderCustomizerProps> = ({
  language,
  decConfig,
  onChangeDecConfig,
  formats,
  onChangeFormats,
  instructions,
  onChangeInstructions,
  coresList,
}) => {
  const t = (value: string) => tr(language, value);
  const [activeFormatId, setActiveFormatId] = useState<string | null>(formats[0]?.id || null);

  const updateParam = (key: keyof DecoderParamConfig, val: number) => {
    onChangeDecConfig({
      ...decConfig,
      [key]: val,
    });
  };

  // --- Format Customizer Helpers ---
  const handleAddFormat = () => {
    const newFmt: InstructionFormat = {
      id: `fmt-${Date.now()}`,
      name: `Format_${formats.length + 1}`,
      fields: [
        { id: `f-${Date.now()}-1`, name: 'opcode', msb: 6, lsb: 0, role: 'Condition' },
        { id: `f-${Date.now()}-2`, name: 'rd', msb: 11, lsb: 7, role: 'rd' },
      ],
    };
    onChangeFormats([...formats, newFmt]);
    setActiveFormatId(newFmt.id);
  };

  const handleRemoveFormat = (id: string) => {
    if (formats.length <= 1) return;
    onChangeFormats(formats.filter((f) => f.id !== id));
    if (activeFormatId === id) {
      setActiveFormatId(formats.find((f) => f.id !== id)?.id || null);
    }
  };

  const handleUpdateFormatName = (id: string, name: string) => {
    onChangeFormats(
      formats.map((f) => (f.id === id ? { ...f, name: name.replace(/\s+/g, '_') } : f))
    );
  };

  const handleAddImmediatePart = (formatId: string) => {
    onChangeFormats(formats.map((fmt) => fmt.id === formatId ? {
      ...fmt,
      immediateParts: [...(fmt.immediateParts || []), {
        id: `imm-${Date.now()}`, sourceMsb: 31, sourceLsb: 20, targetLsb: 0,
      }],
    } : fmt));
  };

  const handleUpdateImmediatePart = (formatId: string, partId: string,
    key: keyof ImmediatePart, value: number) => {
    onChangeFormats(formats.map((fmt) => fmt.id === formatId ? {
      ...fmt,
      immediateParts: (fmt.immediateParts || []).map((part) =>
        part.id === partId ? { ...part, [key]: value } : part),
    } : fmt));
  };

  const handleRemoveImmediatePart = (formatId: string, partId: string) => {
    onChangeFormats(formats.map((fmt) => fmt.id === formatId ? {
      ...fmt,
      immediateParts: (fmt.immediateParts || []).filter((part) => part.id !== partId),
    } : fmt));
  };

  const handleAddField = (fmtId: string) => {
    onChangeFormats(
      formats.map((f) => {
        if (f.id === fmtId) {
          const newField: FormatField = {
            id: `f-${Date.now()}`,
            name: `field_${f.fields.length + 1}`,
            msb: 31,
            lsb: 25,
            role: 'None',
          };
          return { ...f, fields: [...f.fields, newField] };
        }
        return f;
      })
    );
  };

  const handleRemoveField = (fmtId: string, fieldId: string) => {
    onChangeFormats(
      formats.map((f) => {
        if (f.id === fmtId) {
          return { ...f, fields: f.fields.filter((fd) => fd.id !== fieldId) };
        }
        return f;
      })
    );
  };

  const handleUpdateField = (
    fmtId: string,
    fieldId: string,
    key: keyof FormatField,
    val: string | number
  ) => {
    onChangeFormats(
      formats.map((f) => {
        if (f.id === fmtId) {
          return {
            ...f,
            fields: f.fields.map((fd) => (fd.id === fieldId ? { ...fd, [key]: val } : fd)),
          };
        }
        return f;
      })
    );
  };

  // --- Instruction Helpers ---
  const handleAddInstruction = () => {
    const defaultFmt = formats[0];
    if (!defaultFmt) return;

    // Build default condition map
    const defaultConds: Record<string, string> = {};
    defaultFmt.fields.forEach((fd) => {
      if (fd.role === 'Condition') {
        defaultConds[fd.name] = "7'b0000000";
      }
    });

    const newInst: InstructionConfig = {
      id: `inst-${Date.now()}`,
      name: `INST_${instructions.length + 1}`,
      formatId: defaultFmt.id,
      conditions: defaultConds,
      exPathId: coresList[0]?.id || '1',
      microop: instructions.length + 1,
      newregAlloc: true,
      jump: false,
      jumpReg: false,
      branch: false,
    };
    onChangeInstructions([...instructions, newInst]);
  };

  const handleRemoveInstruction = (id: string) => {
    onChangeInstructions(instructions.filter((inst) => inst.id !== id));
  };

  const handleUpdateInstruction = (id: string, key: keyof InstructionConfig, val: InstructionConfig[keyof InstructionConfig]) => {
    onChangeInstructions(
      instructions.map((inst) => (inst.id === id ? { ...inst, [key]: val } : inst))
    );
  };

  const handleUpdateInstructionCondition = (
    instId: string,
    fieldName: string,
    matchValue: string
  ) => {
    onChangeInstructions(
      instructions.map((inst) => {
        if (inst.id === instId) {
          return {
            ...inst,
            conditions: {
              ...inst.conditions,
              [fieldName]: matchValue,
            },
          };
        }
        return inst;
      })
    );
  };

  const activeFormat = formats.find((f) => f.id === activeFormatId);

  return (
    <main className="app-body decoder-body">

      {/* 1. Left Sidebar: Decoder Params & Formats builder */}
      <div className="panel sidebar decoder-sidebar">
        <div className="panel-header">
          <h2 className="panel-title">{t('ISA settings')}</h2>
        </div>

        <div className="sidebar-content" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {/* ISA Name Input */}
          <div className="form-group">
            <label className="form-label">
              <span>{t('ISA Name (Prefix)')}</span>
            </label>
            <input
              type="text"
              style={{
                backgroundColor: '#1e1e1e',
                border: '1px solid var(--border-color)',
                color: 'var(--text-main)',
                padding: '8px 12px',
                fontSize: '13px',
                outline: 'none',
                borderRadius: '2px'
              }}
              value={decConfig.isaName}
              onChange={(e) => onChangeDecConfig({ ...decConfig, isaName: e.target.value.toLowerCase().replace(/\s+/g, '') })}
              placeholder={t('e.g. rv32i, mips, custom')}
            />
          </div>

          {/* Inst bit width */}
          <div className="form-group">
            <label className="form-label">
              <span>{t('Instruction width')}</span>
              <span className="form-value">{decConfig.instBitWidth} {t('bits')}</span>
            </label>
            <input
              type="number"
              min="16"
              max="64"
              value={decConfig.instBitWidth}
              onChange={(e) => updateParam('instBitWidth', parseInt(e.target.value) || 32)}
            />
          </div>

          {/* GPR registers */}
          <div className="form-group">
            <label className="form-label">
              <span>{t('Logical registers')}</span>
              <span className="form-value">{decConfig.instRegs} {t('regs')}</span>
            </label>
            <input
              type="number"
              min="4"
              max="64"
              value={decConfig.instRegs}
              onChange={(e) => updateParam('instRegs', parseInt(e.target.value) || 32)}
            />
          </div>

          {/* Operands per Instruction */}
          <div className="form-group">
            <label className="form-label">
              <span>{t('Source operands')}</span>
              <span className="form-value">{decConfig.instOperands}</span>
            </label>
            <input
              type="number"
              min="1"
              max="4"
              value={decConfig.instOperands}
              onChange={(e) => updateParam('instOperands', parseInt(e.target.value) || 2)}
            />
          </div>

          {/* Immediate width */}
          <div className="form-group">
            <label className="form-label">
              <span>{t('Immediate Width')}</span>
              <span className="form-value">{decConfig.instImm} {t('bits')}</span>
            </label>
            <input
              type="number"
              min="4"
              max="64"
              value={decConfig.instImm}
              onChange={(e) => updateParam('instImm', parseInt(e.target.value) || 32)}
            />
          </div>

          <div style={{ height: '1px', backgroundColor: '#222', margin: '4px 0' }} />

          {/* FORMATS SECTION */}
          <div className="decoder-section-heading">
            <strong>{t('Instruction formats')}</strong>
            <button className="btn" onClick={handleAddFormat}>{t('+ Add')}</button>
          </div>

          {/* Tab selector for active format */}
          <div className="decoder-format-tabs">
            {formats.map((fmt) => (
              <button
                key={fmt.id}
                className={`decoder-format-tab ${activeFormatId === fmt.id ? 'active' : ''}`}
                onClick={() => setActiveFormatId(fmt.id)}
              >
                {fmt.name}
              </button>
            ))}
          </div>

          {activeFormat && (
            <div className="decoder-format-card">
              <div className="decoder-section-heading">
                <strong>{t('Format editor')}</strong>
                {formats.length > 1 && (
                  <button
                    className="btn"
                    aria-label={t('Delete Fmt')}
                    onClick={() => handleRemoveFormat(activeFormat.id)}
                  >
                    {t('Delete Fmt')}
                  </button>
                )}
              </div>

              <div className="form-group">
                <label>{t('Format Name')}</label>
                <input
                  type="text"
                  value={activeFormat.name}
                  onChange={(e) => handleUpdateFormatName(activeFormat.id, e.target.value)}
                />
              </div>

              <div className="decoder-section-heading">
                <strong>{t('Immediate assembly')}</strong>
                <button className="btn"
                  onClick={() => handleAddImmediatePart(activeFormat.id)}>{t('+ Add Part')}</button>
              </div>
              <label className="decoder-check-label">
                <input type="checkbox" checked={!!activeFormat.signExtendImmediate}
                  onChange={(e) => onChangeFormats(formats.map((fmt) => fmt.id === activeFormat.id
                    ? { ...fmt, signExtendImmediate: e.target.checked } : fmt))} /> {t('Sign extend upper bits')}
              </label>
              {(activeFormat.immediateParts || []).map((part) => (
                <div className="decoder-immediate-row" key={part.id}>
                  <span>inst[</span>
                  <input aria-label={t('Source MSB')} type="number" min="0" max={decConfig.instBitWidth - 1}
                    className="decoder-bit-input" value={part.sourceMsb}
                    onChange={(e) => handleUpdateImmediatePart(activeFormat.id, part.id, 'sourceMsb', Number(e.target.value))} />
                  <span>:</span>
                  <input aria-label={t('Source LSB')} type="number" min="0" max={decConfig.instBitWidth - 1}
                    className="decoder-bit-input" value={part.sourceLsb}
                    onChange={(e) => handleUpdateImmediatePart(activeFormat.id, part.id, 'sourceLsb', Number(e.target.value))} />
                  <span>] → imm[</span>
                  <input aria-label={t('Immediate LSB')} type="number" min="0" max={decConfig.instImm - 1}
                    className="decoder-bit-input" value={part.targetLsb}
                    onChange={(e) => handleUpdateImmediatePart(activeFormat.id, part.id, 'targetLsb', Number(e.target.value))} />
                  <span>+:]</span>
                  <button aria-label={t('Remove immediate part')} className="decoder-icon-remove"
                    onClick={() => handleRemoveImmediatePart(activeFormat.id, part.id)}>✕</button>
                </div>
              ))}
              <span className="decoder-help">{t('Upper bits are sign-extended or filled with zero. Without mapping, the imm field is used.')}</span>

              {/* Fields List */}
              <div className="decoder-section-heading">
                <strong>{t('Fields')}</strong>
                <button className="btn" onClick={() => handleAddField(activeFormat.id)}>
                  {t('+ Add Field')}
                </button>
              </div>

              <div className="decoder-field-list">
                {activeFormat.fields.map((field) => (
                  <div
                    key={field.id}
                    className="decoder-field-card"
                  >
                    <div className="decoder-field-top">
                      <input
                        type="text"
                        aria-label={t('Field name')}
                        value={field.name}
                        onChange={(e) => handleUpdateField(activeFormat.id, field.id, 'name', e.target.value.replace(/\s+/g, '_'))}
                      />
                      <button
                        className="decoder-icon-remove"
                        aria-label={t('Remove field')}
                        onClick={() => handleRemoveField(activeFormat.id, field.id)}
                      >
                        ✕
                      </button>
                    </div>

                    <div className="decoder-field-bits">
                      <div>
                        <span>MSB</span>
                        <input
                          type="number"
                          value={field.msb}
                          onChange={(e) => handleUpdateField(activeFormat.id, field.id, 'msb', parseInt(e.target.value) || 0)}
                        />
                      </div>
                      <div>
                        <span>LSB</span>
                        <input
                          type="number"
                          value={field.lsb}
                          onChange={(e) => handleUpdateField(activeFormat.id, field.id, 'lsb', parseInt(e.target.value) || 0)}
                        />
                      </div>
                    </div>

                    <div className="decoder-field-role">
                      <span>{t('Role:')}</span>
                      <select
                        value={field.role}
                        onChange={(e) => handleUpdateField(activeFormat.id, field.id, 'role', e.target.value as FieldRole)}
                      >
                        <option value="Condition">{t('Condition (Match)')}</option>
                        <option value="rd">{t('rd (Dest GPR)')}</option>
                        <option value="rs1">{t('rs1 (Src1 GPR)')}</option>
                        <option value="rs2">{t('rs2 (Src2 GPR)')}</option>
                        <option value="imm">{t('imm (Immediate)')}</option>
                        <option value="None">{t('None')}</option>
                      </select>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      {/* 2. Center: Instruction DB Table */}
      <div className="panel decoder-instructions">
        <div className="panel-header">
          <h2 className="panel-title">{t('Instructions')}</h2>
          <button className="btn btn-primary" onClick={handleAddInstruction}>
            {t('+ Add Instruction')}
          </button>
        </div>

        <div className="decoder-instruction-scroll">
          <table className="instruction-table">
            <thead>
              <tr>
                <th style={{ padding: '6px' }}>{t('Name')}</th>
                <th style={{ padding: '6px' }}>{t('Format')}</th>
                <th style={{ padding: '6px', width: '220px' }}>{t('Match Conditions')}</th>
                <th style={{ padding: '6px' }}>{t('EX path')}</th>
                <th style={{ padding: '6px', width: '60px' }}>uOp</th>
                <th style={{ padding: '6px' }}>{t('New reg')}</th>
                <th style={{ padding: '6px' }}>{t('Control')}</th>
                <th style={{ padding: '6px', textAlign: 'center' }}>{t('Remove')}</th>
              </tr>
            </thead>
            <tbody>
              {instructions.map((inst) => {
                const currentFmt = formats.find((f) => f.id === inst.formatId) || formats[0];
                const condFields = currentFmt?.fields.filter((fd) => fd.role === 'Condition') || [];

                return (
                  <tr key={inst.id}>

                    {/* Name */}
                    <td style={{ padding: '4px' }}>
                      <input
                        type="text"
                        className="decoder-inst-name"
                        value={inst.name}
                        onChange={(e) => handleUpdateInstruction(inst.id, 'name', e.target.value.toUpperCase().replace(/\s+/g, ''))}
                      />
                    </td>

                    {/* Format Selector */}
                    <td style={{ padding: '4px' }}>
                      <select
                        className="decoder-inst-format"
                        value={inst.formatId}
                        onChange={(e) => {
                          const newFmtId = e.target.value;
                          const newFmt = formats.find((f) => f.id === newFmtId);
                          const freshConds: Record<string, string> = {};
                          newFmt?.fields.forEach((fd) => {
                            if (fd.role === 'Condition') {
                              freshConds[fd.name] = "7'b0000000";
                            }
                          });
                          onChangeInstructions(
                            instructions.map((it) =>
                              it.id === inst.id
                                ? { ...it, formatId: newFmtId, conditions: freshConds }
                                : it
                            )
                          );
                        }}
                      >
                        {formats.map((f) => (
                          <option key={f.id} value={f.id}>
                            {f.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Conditions */}
                    <td style={{ padding: '4px' }}>
                      <div style={{ display: 'flex', flexDirection: 'column', gap: '3px' }}>
                        {condFields.length === 0 && <span className="decoder-help">{t('No condition fields')}</span>}
                        {condFields.map((fd) => (
                          <div key={fd.id} style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                            <span className="decoder-cond-name">{fd.name}:</span>
                            <input
                              type="text"
                              placeholder={t("e.g. 7'b0110011")}
                              className="decoder-cond-input"
                              value={inst.conditions[fd.name] || ''}
                              onChange={(e) => handleUpdateInstructionCondition(inst.id, fd.name, e.target.value)}
                            />
                          </div>
                        ))}
                      </div>
                    </td>

                    {/* Target Core Path Mapping */}
                    <td style={{ padding: '4px' }}>
                      <select
                        className="decoder-inst-ex"
                        value={inst.exPathId}
                        onChange={(e) => handleUpdateInstruction(inst.id, 'exPathId', e.target.value)}
                      >
                        {coresList.map((core) => (
                          <option key={core.id} value={core.id}>
                            {core.name}
                          </option>
                        ))}
                      </select>
                    </td>

                    {/* Micro-op */}
                    <td style={{ padding: '4px' }}>
                      <input
                        type="number"
                        min="0"
                        max="31"
                        className="decoder-inst-uop"
                        value={inst.microop}
                        onChange={(e) => handleUpdateInstruction(inst.id, 'microop', parseInt(e.target.value) || 0)}
                      />
                    </td>

                    {/* Destination allocation */}
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <input
                        type="checkbox"
                        checked={inst.newregAlloc}
                        onChange={(e) => handleUpdateInstruction(inst.id, 'newregAlloc', e.target.checked)}
                      />
                    </td>

                    {/* Control Flags */}
                    <td style={{ padding: '4px' }}>
                      <div className="decoder-flags">
                        <label style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <input
                            type="checkbox"
                            checked={inst.jump}
                            onChange={(e) => handleUpdateInstruction(inst.id, 'jump', e.target.checked)}
                          />
                          {t('Jump')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <input
                            type="checkbox"
                            checked={inst.jumpReg}
                            onChange={(e) => handleUpdateInstruction(inst.id, 'jumpReg', e.target.checked)}
                          />
                          {t('JmpReg')}
                        </label>
                        <label style={{ display: 'flex', alignItems: 'center', gap: '3px' }}>
                          <input
                            type="checkbox"
                            checked={inst.branch}
                            onChange={(e) => handleUpdateInstruction(inst.id, 'branch', e.target.checked)}
                          />
                          {t('Branch')}
                        </label>
                      </div>
                    </td>

                    {/* Remove Action */}
                    <td style={{ padding: '4px', textAlign: 'center' }}>
                      <button
                        className="decoder-remove-btn"
                        onClick={() => handleRemoveInstruction(inst.id)}
                      >
                        {t('Remove')}
                      </button>
                    </td>

                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

    </main>
  );
};
